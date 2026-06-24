import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createProductSchema, updateProductSchema, updateProductPriceSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  findAll(user: AuthUser, storeId?: string) {
    return this.prisma.product.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        storeSettings: storeId ? { where: { storeId } } : true,
        stockBalances: storeId ? { where: { storeId } } : true,
      },
      orderBy: { name: 'asc' },
    });
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

    if (storeId && data.price !== undefined) {
      assertStoreAccess(user, storeId);
      await this.prisma.productStoreSetting.create({
        data: { productId: product.id, storeId, price: data.price },
      });
      await this.prisma.stockBalance.create({
        data: { productId: product.id, storeId, available: 0 },
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
    return this.prisma.productStoreSetting.upsert({
      where: { productId_storeId: { productId, storeId: data.storeId } },
      update: { price: data.price, active: data.active ?? true },
      create: { productId, storeId: data.storeId, price: data.price, active: data.active ?? true },
    });
  }
}
