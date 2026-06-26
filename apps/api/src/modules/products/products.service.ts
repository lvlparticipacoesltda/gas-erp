import { Injectable, NotFoundException } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { createProductSchema, updateProductSchema, updateProductPriceSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthUser, storeId?: string, page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = { organizationId: user.organizationId, active: true };
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
    return paginatedResult(data, total, p, ps);
  }

  async findOne(user: AuthUser, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { storeSettings: true, stockBalances: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  async create(user: AuthUser, input: unknown, storeId?: string) {
    const data = createProductSchema.parse(input);
    const product = await this.prisma.product.create({
      data: {
        organizationId: user.organizationId,
        sku: data.sku,
        name: data.name,
        description: data.description,
        unit: data.unit,
        productType: data.productType,
        active: data.active ?? true,
      },
    });

    if (storeId) {
      assertStoreAccess(user, storeId);
      await this.prisma.productStoreSetting.upsert({
        where: { productId_storeId: { productId: product.id, storeId } },
        update: { price: data.price ?? 0, deliveryFee: data.deliveryFee ?? 0 },
        create: {
          productId: product.id,
          storeId,
          price: data.price ?? 0,
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
    return this.prisma.product.update({ where: { id }, data });
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
        deliveryFee: data.deliveryFee ?? 0,
        active: data.active ?? true,
      },
      create: {
        productId,
        storeId: data.storeId,
        price: data.price,
        deliveryFee: data.deliveryFee ?? 0,
        active: data.active ?? true,
      },
    });
  }
}
