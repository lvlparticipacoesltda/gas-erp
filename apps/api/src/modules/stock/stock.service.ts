import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  adjustStockSchema,
  AuthUser,
  canManageStock,
  DashboardDateQuery,
  productTypeRequiresVasilhame,
  resolveDashboardDateRange,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { paginate, paginatedResult } from '../../common/utils/pagination';

type DbClient = PrismaService | Prisma.TransactionClient;

/** Motivo padrão da baixa de estoque por venda (usado para idempotência e estorno). */
const SALE_STOCK_OUT_REASON = 'Ref. à venda de mercadorias.';

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

  async getMovements(
    user: AuthUser,
    storeId: string,
    page = 1,
    pageSize = 20,
    dateQuery?: DashboardDateQuery,
  ) {
    assertStoreAccess(user, storeId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);

    let movementIdsFilter: string[] | undefined;
    if (dateQuery?.date || dateQuery?.dateFrom || dateQuery?.dateTo) {
      let dateFrom: string;
      let dateTo: string;
      try {
        ({ dateFrom, dateTo } = resolveDashboardDateRange(dateQuery));
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Intervalo de datas inválido',
        );
      }

      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM "StockMovement"
        WHERE "storeId" = ${storeId}
          AND DATE(
            (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')
          ) >= ${dateFrom}::date
          AND DATE(
            (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')
          ) <= ${dateTo}::date
      `;
      movementIdsFilter = rows.map((row) => row.id);
      if (movementIdsFilter.length === 0) {
        return paginatedResult([], 0, p, ps);
      }
    }

    const where = {
      storeId,
      ...(movementIdsFilter ? { id: { in: movementIdsFilter } } : {}),
    };
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

    const referenceIds = [
      ...new Set(data.map((movement) => movement.referenceId).filter((id): id is string => !!id)),
    ];
    const transfers = referenceIds.length
      ? await this.prisma.stockTransfer.findMany({
          where: { id: { in: referenceIds } },
          include: { fromStore: { select: { id: true, name: true } }, toStore: { select: { id: true, name: true } } },
        })
      : [];
    const transferById = new Map(transfers.map((transfer) => [transfer.id, transfer]));

    const enriched = data.map((movement) => {
      const transfer = movement.referenceId ? transferById.get(movement.referenceId) : undefined;
      return {
        ...movement,
        transfer: transfer
          ? {
              id: transfer.id,
              fromStoreId: transfer.fromStoreId,
              toStoreId: transfer.toStoreId,
              fromStoreName: transfer.fromStore.name,
              toStoreName: transfer.toStore.name,
              completedAt: transfer.completedAt,
            }
          : null,
      };
    });

    return paginatedResult(enriched, total, p, ps);
  }

  async adjust(user: AuthUser, input: unknown) {
    if (!canManageStock(user.role)) {
      throw new ForbiddenException('Sem permissão para ajustar estoque.');
    }
    const data = adjustStockSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    // Entrada (quantidade positiva) de produto cheio (GLP/Água) trava pelo
    // estoque de vasilhames vazios; retirada (negativa) é sempre permitida.
    if (data.quantity > 0) {
      await this.assertVasilhameForFullEntry(user, data.storeId, data.productId, data.quantity);
    }

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

  /**
   * Trava para entrada de produto cheio (GLP/Água) via ajuste manual: exige
   * vasilhame vinculado e que a quantidade não exceda o estoque de vasilhames
   * disponível na unidade.
   */
  private async assertVasilhameForFullEntry(
    user: AuthUser,
    storeId: string,
    productId: string,
    quantity: number,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
      select: { id: true, name: true, productType: true, vasilhameProductId: true },
    });
    if (!product || !productTypeRequiresVasilhame(product.productType)) return;
    if (!product.vasilhameProductId) {
      throw new BadRequestException(
        `Vincule um vasilhame ao produto "${product.name}" (no cadastro de produtos) para lançar entrada de estoque.`,
      );
    }
    const [vasProduct, vasBalance] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: product.vasilhameProductId },
        select: { name: true },
      }),
      this.prisma.stockBalance.findUnique({
        where: { productId_storeId: { productId: product.vasilhameProductId, storeId } },
        select: { available: true },
      }),
    ]);
    const available = vasBalance?.available ?? 0;
    if (quantity > available) {
      throw new BadRequestException(
        `Estoque de vasilhame insuficiente: "${vasProduct?.name ?? 'vasilhame'}" tem ${available} em estoque nesta unidade, mas você tentou lançar ${quantity}.`,
      );
    }
  }

  async deductForTransfer(
    db: DbClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    transferId: string,
    toStoreName: string,
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
        reason: `Transferência de estoque para ${toStoreName}.`,
        referenceId: transferId,
      },
    });
  }

  async addForTransfer(
    db: DbClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    transferId: string,
    fromStoreName: string,
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
        reason: `Transferência de estoque recebida de ${fromStoreName}.`,
        referenceId: transferId,
      },
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
        reason: SALE_STOCK_OUT_REASON,
        referenceId: saleId,
      },
    });
  }

  /** Indica se a venda já gerou baixa de estoque (evita duplicar / permite cancelar sem estorno indevido). */
  async hasSaleStockDeduction(db: DbClient, saleId: string): Promise<boolean> {
    const count = await db.stockMovement.count({
      where: {
        referenceId: saleId,
        type: StockMovementType.OUT,
        reason: SALE_STOCK_OUT_REASON,
      },
    });
    return count > 0;
  }

  /** Baixa todos os itens da venda uma única vez (entrega / portaria). */
  async deductSaleItems(
    db: DbClient,
    storeId: string,
    items: { productId: string; quantity: number }[],
    userId: string,
    saleId: string,
  ) {
    if (await this.hasSaleStockDeduction(db, saleId)) return;
    for (const item of items) {
      await this.deductForSale(db, storeId, item.productId, item.quantity, userId, saleId);
    }
  }

  async restoreForCancelledSale(
    db: DbClient,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string,
    saleId: string,
  ) {
    await db.stockBalance.upsert({
      where: { productId_storeId: { productId, storeId } },
      update: { available: { increment: quantity } },
      create: { productId, storeId, available: quantity },
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
