import { Injectable, NotFoundException } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { customerAddressSchema, createCustomerSchema, updateCustomerSchema, upsertCustomerProductPriceSchema } from '@gas-erp/shared';
import { AuthUser, toNumber } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthUser, search?: string, page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = {
      organizationId: user.organizationId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
              { document: { contains: search } },
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

    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { category: true, addresses: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const saleWhere = {
      customerId: id,
      ...(storeId ? { storeId } : {}),
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
    return this.prisma.customer.create({
      data: {
        organizationId: user.organizationId,
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        document: data.document,
        notes: data.notes,
        categoryId: data.categoryId,
        addresses: data.addresses?.length
          ? { create: data.addresses }
          : undefined,
      },
      include: { addresses: true, category: true },
    });
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const customer = await this.findOne(user, id);
    const data = updateCustomerSchema.parse(input);
    const { addresses, ...customerData } = data;

    await this.prisma.customer.update({
      where: { id },
      data: {
        ...(customerData.name !== undefined ? { name: customerData.name } : {}),
        ...(customerData.email !== undefined ? { email: customerData.email || null } : {}),
        ...(customerData.phone !== undefined ? { phone: customerData.phone } : {}),
        ...(customerData.document !== undefined ? { document: customerData.document } : {}),
        ...(customerData.notes !== undefined ? { notes: customerData.notes } : {}),
        ...(customerData.categoryId !== undefined ? { categoryId: customerData.categoryId } : {}),
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

    return this.findOne(user, id);
  }

  async addAddress(user: AuthUser, customerId: string, input: unknown) {
    await this.findOne(user, customerId);
    const data = customerAddressSchema.parse(input);
    return this.prisma.customerAddress.create({
      data: { ...data, customerId },
    });
  }

  async listProductPrices(user: AuthUser, customerId: string, storeId: string) {
    assertStoreAccess(user, storeId);
    await this.findOne(user, customerId);

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
    assertStoreAccess(user, storeId);
    await this.findOne(user, customerId);
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
    await this.findOne(user, customerId);

    const existing = await this.prisma.customerProductPrice.findUnique({
      where: {
        customerId_productId_storeId: { customerId, productId, storeId },
      },
    });
    if (!existing) throw new NotFoundException('Preço especial não encontrado');

    await this.prisma.customerProductPrice.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  /** Mapa productId → preço para uso na nova venda. */
  async productPriceMap(user: AuthUser, customerId: string, storeId: string) {
    assertStoreAccess(user, storeId);
    const rows = await this.listProductPrices(user, customerId, storeId);
    return Object.fromEntries(rows.map((row) => [row.productId, row.price]));
  }
}
