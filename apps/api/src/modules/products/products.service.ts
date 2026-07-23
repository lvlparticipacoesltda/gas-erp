import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { createProductSchema, updateProductSchema, updateProductPriceSchema, canViewFinancialMargins } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private sanitizeProduct<T extends { storeSettings?: { supplierCost?: unknown }[] }>(
    user: AuthUser,
    product: T,
  ): T {
    if (canViewFinancialMargins(user.role)) return product;
    if (!product.storeSettings?.length) return product;
    return {
      ...product,
      storeSettings: product.storeSettings.map(({ supplierCost: _removed, ...setting }) => setting),
    } as T;
  }

  async findAll(user: AuthUser, storeId?: string, page = 1, pageSize = 20, search?: string) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const term = search?.trim();
    const where = {
      organizationId: user.organizationId,
      active: true,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { sku: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          storeSettings: storeId ? { where: { storeId } } : true,
          stockBalances: storeId ? { where: { storeId } } : true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginatedResult(data.map((product) => this.sanitizeProduct(user, product)), total, p, ps);
  }

  async findOne(user: AuthUser, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { storeSettings: true, stockBalances: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return this.sanitizeProduct(user, product);
  }

  async create(user: AuthUser, input: unknown, storeId?: string) {
    const data = createProductSchema.parse(input);
    if (data.vasilhameProductId) {
      await this.assertVasilhameProduct(user, data.vasilhameProductId);
    }
    const product = await this.prisma.product.create({
      data: {
        organizationId: user.organizationId,
        sku: data.sku,
        name: data.name,
        description: data.description,
        unit: data.unit,
        productType: data.productType,
        vasilhameProductId: data.vasilhameProductId ?? null,
        active: data.active ?? true,
      },
    });

    if (storeId) {
      assertStoreAccess(user, storeId);
      await this.prisma.productStoreSetting.upsert({
        where: { productId_storeId: { productId: product.id, storeId } },
        update: {
          price: data.price ?? 0,
          supplierCost: data.supplierCost ?? 0,
          deliveryFee: data.deliveryFee ?? 0,
        },
        create: {
          productId: product.id,
          storeId,
          price: data.price ?? 0,
          supplierCost: data.supplierCost ?? 0,
          deliveryFee: data.deliveryFee ?? 0,
        },
      });
      await this.prisma.stockBalance.upsert({
        where: { productId_storeId: { productId: product.id, storeId } },
        update: {},
        create: { productId: product.id, storeId, available: 0 },
      });
    }

    return product;
  }

  async update(user: AuthUser, id: string, input: unknown) {
    await this.findOne(user, id);
    const data = updateProductSchema.parse(input);
    if (data.vasilhameProductId) {
      if (data.vasilhameProductId === id) {
        throw new BadRequestException('Um produto não pode ser o próprio vasilhame.');
      }
      await this.assertVasilhameProduct(user, data.vasilhameProductId);
    }
    return this.prisma.product.update({ where: { id }, data });
  }

  /** Garante que o vasilhame informado existe e pertence à organização. */
  private async assertVasilhameProduct(user: AuthUser, vasilhameProductId: string) {
    const vasilhame = await this.prisma.product.findFirst({
      where: { id: vasilhameProductId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!vasilhame) throw new BadRequestException('Vasilhame informado não encontrado.');
  }

  async updatePrice(user: AuthUser, productId: string, input: unknown) {
    await this.findOne(user, productId);
    const data = updateProductPriceSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    await this.prisma.stockBalance.upsert({
      where: { productId_storeId: { productId, storeId: data.storeId } },
      update: {},
      create: { productId, storeId: data.storeId, available: 0 },
    });

    return this.prisma.productStoreSetting.upsert({
      where: { productId_storeId: { productId, storeId: data.storeId } },
      update: {
        price: data.price,
        supplierCost: data.supplierCost ?? 0,
        deliveryFee: data.deliveryFee ?? 0,
        active: data.active ?? true,
      },
      create: {
        productId,
        storeId: data.storeId,
        price: data.price,
        supplierCost: data.supplierCost ?? 0,
        deliveryFee: data.deliveryFee ?? 0,
        active: data.active ?? true,
      },
    });
  }
}
