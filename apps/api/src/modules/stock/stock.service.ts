import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { adjustStockSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  async getBalances(user: AuthUser, storeId: string) {
    assertStoreAccess(user, storeId);
    return this.prisma.stockBalance.findMany({
      where: { storeId, product: { organizationId: user.organizationId } },
      include: { product: true },
      orderBy: { product: { name: 'asc' } },
    });
  }

  async getMovements(user: AuthUser, storeId: string, page = 1, pageSize = 20) {
    assertStoreAccess(user, storeId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = { storeId };
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take,
        include: { product: true, user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return paginatedResult(data, total, p, ps);
  }

  async adjust(user: AuthUser, input: unknown) {
    const data = adjustStockSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.stockBalance.upsert({
        where: { productId_storeId: { productId: data.productId, storeId: data.storeId } },
        update: {},
        create: { productId: data.productId, storeId: data.storeId, available: 0 },
      });

      const newQty = balance.available + data.quantity;
      if (newQty < 0) throw new BadRequestException('Estoque insuficiente');

      await tx.stockBalance.update({
        where: { id: balance.id },
        data: { available: newQty },
      });

      await tx.stockMovement.create({
        data: {
          productId: data.productId,
          storeId: data.storeId,
          userId: user.id,
          type: data.quantity >= 0 ? StockMovementType.IN : StockMovementType.OUT,
          quantity: Math.abs(data.quantity),
          reason: data.reason,
        },
      });

      return tx.stockBalance.findUnique({
        where: { id: balance.id },
        include: { product: true },
      });
    });
  }

  async deductForSale(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    saleId: string,
  ) {
    const balance = await tx.stockBalance.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });
    if (!balance || balance.available < quantity) {
      throw new BadRequestException('Estoque insuficiente para o produto');
    }
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { available: balance.available - quantity },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        storeId,
        userId,
        type: StockMovementType.OUT,
        quantity,
        reason: 'Ref. à venda de mercadorias.',
        referenceId: saleId,
      },
    });
  }

  async restoreForCancelledSale(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    saleId: string,
  ) {
    const balance = await tx.stockBalance.upsert({
      where: { productId_storeId: { productId, storeId } },
      update: {},
      create: { productId, storeId, available: 0 },
    });
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { available: balance.available + quantity },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        storeId,
        userId,
        type: StockMovementType.IN,
        quantity,
        reason: 'Ref. ao cancelamento de venda de mercadorias.',
        referenceId: saleId,
      },
    });
  }
}
