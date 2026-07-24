import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  customerAddressSchema,
  createCustomerSchema,
  updateCustomerSchema,
  upsertCustomerProductPriceSchema,
  phoneSearchTerms,
  CUSTOMER_CATEGORY_FILTER_NONE,
  CUSTOMER_CATEGORY_NAMES,
} from '@gas-erp/shared';
import { AuthUser, toNumber } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  /** Garante P13/P20/P45 ativas na organização (idempotente). */
  async ensureOrgCustomerCategories(organizationId: string) {
    await Promise.all(
      CUSTOMER_CATEGORY_NAMES.map((name) =>
        this.prisma.customerCategory.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { active: true },
          create: { organizationId, name },
        }),
      ),
    );
  }

  async listCategories(user: AuthUser) {
    await this.ensureOrgCustomerCategories(user.organizationId);
    return this.prisma.customerCategory.findMany({
      where: {
        organizationId: user.organizationId,
        active: true,
        name: { in: [...CUSTOMER_CATEGORY_NAMES] },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    });
  }

  private async assertCategoryInOrg(organizationId: string, categoryId: string | null | undefined) {
    if (categoryId == null || categoryId === '') return null;
    const cat = await this.prisma.customerCategory.findFirst({
      where: { id: categoryId, organizationId, active: true },
      select: { id: true },
    });
    if (!cat) throw new BadRequestException('Categoria de cliente inválida.');
    return cat.id;
  }

  private async getCustomerInOrg(user: AuthUser, id: string, storeId?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        ...(storeId ? { storeId } : {}),
      },
      include: { category: true, addresses: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async findAll(
    user: AuthUser,
    storeId: string,
    search?: string,
    page = 1,
    pageSize = 20,
    categoryId?: string,
  ) {
    if (!storeId) throw new BadRequestException('storeId é obrigatório');
    assertStoreAccess(user, storeId);

    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);

    let categoryFilter: { categoryId: string | null } | Record<string, never> = {};
    if (categoryId === CUSTOMER_CATEGORY_FILTER_NONE) {
      categoryFilter = { categoryId: null };
    } else if (categoryId?.trim()) {
      categoryFilter = { categoryId: categoryId.trim() };
    }

    const where = {
      organizationId: user.organizationId,
      storeId,
      active: true,
      ...categoryFilter,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { document: { contains: search } },
              ...phoneSearchTerms(search).map((term) => ({ phone: { contains: term } })),
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        include: { category: true, addresses: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginatedResult(data, total, p, ps);
  }

  async findOne(
    user: AuthUser,
    id: string,
    storeId?: string,
    page = 1,
    pageSize = 10,
  ) {
    if (storeId) assertStoreAccess(user, storeId);
    const customer = await this.getCustomerInOrg(user, id, storeId);

    const saleWhere = {
      customerId: id,
      storeId: storeId ?? customer.storeId,
      status: { not: SaleStatus.CANCELLED },
    };
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const [sales, salesTotal] = await Promise.all([
      this.prisma.sale.findMany({
        where: saleWhere,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          attendant: { select: { name: true } },
          deliverer: { include: { user: { select: { name: true } } } },
          items: { include: { product: { select: { name: true } } } },
          payments: {
            include: {
              storePaymentMethod: { select: { id: true, label: true, systemCode: true } },
            },
          },
        },
      }),
      this.prisma.sale.count({ where: saleWhere }),
    ]);

    return {
      ...customer,
      sales: paginatedResult(sales, salesTotal, p, ps),
    };
  }

  async create(user: AuthUser, input: unknown) {
    const data = createCustomerSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    const store = await this.prisma.store.findFirst({
      where: { id: data.storeId, organizationId: user.organizationId },
    });
    if (!store) throw new BadRequestException('Loja não encontrada');

    const categoryId = await this.assertCategoryInOrg(user.organizationId, data.categoryId);

    return this.prisma.customer.create({
      data: {
        organizationId: user.organizationId,
        storeId: data.storeId,
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        document: data.document,
        notes: data.notes,
        categoryId,
        addresses: data.addresses?.length
          ? { create: data.addresses }
          : undefined,
      },
      include: { addresses: true, category: true },
    });
  }

  async update(user: AuthUser, id: string, storeId: string | undefined, input: unknown) {
    const customer = await this.getCustomerInOrg(user, id, storeId);
    if (storeId) assertStoreAccess(user, storeId);

    const data = updateCustomerSchema.parse(input);
    const { addresses, ...customerData } = data;

    let nextCategoryId: string | null | undefined = undefined;
    if (customerData.categoryId !== undefined) {
      nextCategoryId = await this.assertCategoryInOrg(
        user.organizationId,
        customerData.categoryId,
      );
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        ...(customerData.name !== undefined ? { name: customerData.name } : {}),
        ...(customerData.email !== undefined ? { email: customerData.email || null } : {}),
        ...(customerData.phone !== undefined ? { phone: customerData.phone } : {}),
        ...(customerData.document !== undefined ? { document: customerData.document } : {}),
        ...(customerData.notes !== undefined ? { notes: customerData.notes } : {}),
        ...(nextCategoryId !== undefined ? { categoryId: nextCategoryId } : {}),
        ...(customerData.active !== undefined ? { active: customerData.active } : {}),
      },
    });

    if (addresses?.[0]) {
      const addr = addresses[0];
      const existing = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0];
      if (existing) {
        await this.prisma.customerAddress.update({
          where: { id: existing.id },
          data: addr,
        });
      } else {
        await this.prisma.customerAddress.create({
          data: { ...addr, customerId: id, isDefault: addr.isDefault ?? true },
        });
      }
    }

    return this.findOne(user, id, storeId ?? customer.storeId);
  }

  async remove(user: AuthUser, id: string, storeId: string) {
    if (!storeId) throw new BadRequestException('storeId é obrigatório');
    assertStoreAccess(user, storeId);
    await this.getCustomerInOrg(user, id, storeId);

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.updateMany({ where: { customerId: id }, data: { customerId: null } });
      await tx.customer.delete({ where: { id } });
    });
    return { ok: true };
  }

  async addAddress(user: AuthUser, customerId: string, storeId: string | undefined, input: unknown) {
    await this.getCustomerInOrg(user, customerId, storeId);
    const data = customerAddressSchema.parse(input);
    return this.prisma.customerAddress.create({
      data: { ...data, customerId },
    });
  }

  async listProductPrices(user: AuthUser, customerId: string, storeId: string) {
    if (!storeId) throw new BadRequestException('storeId é obrigatório');
    assertStoreAccess(user, storeId);
    await this.getCustomerInOrg(user, customerId, storeId);

    const rows = await this.prisma.customerProductPrice.findMany({
      where: { customerId, storeId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    const productIds = rows.map((row) => row.productId);
    const storeSettings = productIds.length
      ? await this.prisma.productStoreSetting.findMany({
          where: { storeId, productId: { in: productIds } },
          select: { productId: true, price: true },
        })
      : [];
    const defaultPriceByProduct = new Map(
      storeSettings.map((setting) => [setting.productId, toNumber(setting.price)]),
    );

    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      productSku: row.product.sku,
      storeId: row.storeId,
      price: toNumber(row.price),
      defaultStorePrice: defaultPriceByProduct.get(row.productId) ?? null,
    }));
  }

  async upsertProductPrice(
    user: AuthUser,
    customerId: string,
    storeId: string,
    input: unknown,
  ) {
    if (!storeId) throw new BadRequestException('storeId é obrigatório');
    assertStoreAccess(user, storeId);
    await this.getCustomerInOrg(user, customerId, storeId);
    const data = upsertCustomerProductPriceSchema.parse(input);

    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, organizationId: user.organizationId, active: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const row = await this.prisma.customerProductPrice.upsert({
      where: {
        customerId_productId_storeId: {
          customerId,
          productId: data.productId,
          storeId,
        },
      },
      update: { price: data.price },
      create: {
        customerId,
        productId: data.productId,
        storeId,
        price: data.price,
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });

    const storeSetting = await this.prisma.productStoreSetting.findUnique({
      where: { productId_storeId: { productId: data.productId, storeId } },
      select: { price: true },
    });

    return {
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      productSku: row.product.sku,
      storeId: row.storeId,
      price: toNumber(row.price),
      defaultStorePrice: storeSetting ? toNumber(storeSetting.price) : null,
    };
  }

  async deleteProductPrice(
    user: AuthUser,
    customerId: string,
    storeId: string,
    productId: string,
  ) {
    assertStoreAccess(user, storeId);
    await this.getCustomerInOrg(user, customerId, storeId);

    const existing = await this.prisma.customerProductPrice.findUnique({
      where: {
        customerId_productId_storeId: { customerId, productId, storeId },
      },
    });
    if (!existing) throw new NotFoundException('Preço especial não encontrado');

    await this.prisma.customerProductPrice.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async productPriceMap(user: AuthUser, customerId: string, storeId: string) {
    assertStoreAccess(user, storeId);
    await this.getCustomerInOrg(user, customerId, storeId);
    const rows = await this.listProductPrices(user, customerId, storeId);
    return Object.fromEntries(rows.map((row) => [row.productId, row.price]));
  }
}
