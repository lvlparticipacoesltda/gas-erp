import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { adjustStockSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { paginate, paginatedResult } from '../../common/utils/pagination';

type DbClient = PrismaService | Prisma.TransactionClient;

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

    const balance = await this.prisma.stockBalance.upsert({
      where: { productId_storeId: { productId: data.productId, storeId: data.storeId } },
      update: {},
      create: { productId: data.productId, storeId: data.storeId, available: 0 },
    });

    const newQty = balance.available + data.quantity;
    if (newQty < 0) throw new BadRequestException('Estoque insuficiente');

    await this.prisma.stockBalance.update({
      where: { id: balance.id },
      data: { available: newQty },
    });

    await this.prisma.stockMovement.create({
      data: {
        productId: data.productId,
        storeId: data.storeId,
        userId: user.id,
        type: data.quantity >= 0 ? StockMovementType.IN : StockMovementType.OUT,
        quantity: Math.abs(data.quantity),
        reason: data.reason,
      },
    });

    return this.prisma.stockBalance.findUnique({
      where: { id: balance.id },
      include: { product: true },
    });
  }

  async deductForSale(
    db: DbClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    saleId: string,
  ) {
    const balance = await db.stockBalance.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });
    if (!balance || balance.available < quantity) {
      throw new BadRequestException('Estoque insuficiente para o produto');
    }
    await db.stockBalance.update({
      where: { id: balance.id },
      data: { available: balance.available - quantity },
    });
    await db.stockMovement.create({
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
    db: DbClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    saleId: string,
  ) {
    const balance = await db.stockBalance.upsert({
      where: { productId_storeId: { productId, storeId } },
      update: {},
      create: { productId, storeId, available: 0 },
    });
    await db.stockBalance.update({
      where: { id: balance.id },
      data: { available: balance.available + quantity },
    });
    await db.stockMovement.create({
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

  /** Entrada de estoque por nota de compra (incrementa disponível). */
  async addForPurchase(
    db: DbClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    invoiceId: string,
  ) {
    const balance = await db.stockBalance.upsert({
      where: { productId_storeId: { productId, storeId } },
      update: {},
      create: { productId, storeId, available: 0 },
    });
    await db.stockBalance.update({
      where: { id: balance.id },
      data: { available: balance.available + quantity },
    });
    await db.stockMovement.create({
      data: {
        productId,
        storeId,
        userId,
        type: StockMovementType.IN,
        quantity,
        reason: 'Ref. à entrada por nota de compra.',
        referenceId: invoiceId,
      },
    });
  }

  /** Estorno da entrada quando a nota de compra é cancelada (movimento de saída). */
  async reverseForCancelledPurchase(
    db: DbClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    invoiceId: string,
  ) {
    const balance = await db.stockBalance.upsert({
      where: { productId_storeId: { productId, storeId } },
      update: {},
      create: { productId, storeId, available: 0 },
    });
    const nextAvailable = Math.max(0, balance.available - quantity);
    await db.stockBalance.update({
      where: { id: balance.id },
      data: { available: nextAvailable },
    });
    await db.stockMovement.create({
      data: {
        productId,
        storeId,
        userId,
        type: StockMovementType.OUT,
        quantity,
        reason: 'Ref. ao cancelamento de nota de compra.',
        referenceId: invoiceId,
      },
    });
  }
}
