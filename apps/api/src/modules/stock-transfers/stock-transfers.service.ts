import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockTransferStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  STOCK_TRANSFER_STATUSES,
  canManageStock,
  createStockTransferSchema,
  updateStockTransferStatusSchema,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { StockService } from '../stock/stock.service';
import { AuditService } from '../../common/audit/audit.service';

type TransferLine = { productId: string; quantity: number };

export type StockTransferListQuery = {
  storeId?: string;
  fromStoreId?: string;
  toStoreId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

@Injectable()
export class StockTransfersService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
  ) {}

  /**
   * Escopo org-wide para master/admin; demais usuários veem lojas do vínculo.
   * `storeId` (legado) = origem OU destino; `fromStoreId`/`toStoreId` filtram lados.
   */
  private buildScopeWhere(
    user: AuthUser,
    query: StockTransferListQuery,
  ): Prisma.StockTransferWhereInput {
    const { storeId, fromStoreId, toStoreId } = query;

    if (storeId) assertStoreAccess(user, storeId);
    if (fromStoreId) assertStoreAccess(user, fromStoreId);
    if (toStoreId) assertStoreAccess(user, toStoreId);

    const where: Prisma.StockTransferWhereInput = {};

    if (user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN') {
      where.fromStore = { organizationId: user.organizationId };
      where.toStore = { organizationId: user.organizationId };
    } else {
      where.OR = [
        { fromStoreId: { in: user.storeIds } },
        { toStoreId: { in: user.storeIds } },
      ];
    }

    if (storeId) {
      where.AND = [{ OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] }];
    }
    if (fromStoreId) where.fromStoreId = fromStoreId;
    if (toStoreId) where.toStoreId = toStoreId;

    if (query.status) {
      if (!(STOCK_TRANSFER_STATUSES as readonly string[]).includes(query.status)) {
        throw new BadRequestException('Status de transferência inválido');
      }
      where.status = query.status as StockTransferStatus;
    }

    const requestedAt: Prisma.DateTimeFilter = {};
    if (query.dateFrom) requestedAt.gte = new Date(`${query.dateFrom}T00:00:00`);
    if (query.dateTo) {
      const end = new Date(`${query.dateTo}T00:00:00`);
      end.setDate(end.getDate() + 1);
      requestedAt.lt = end;
    }
    if (query.dateFrom || query.dateTo) where.requestedAt = requestedAt;

    return where;
  }

  findAll(user: AuthUser, query: StockTransferListQuery = {}) {
    return this.prisma.stockTransfer.findMany({
      where: this.buildScopeWhere(user, query),
      include: { items: { include: { product: true } }, fromStore: true, toStore: true },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * Expande itens com o vasilhame vinculado (`Product.vasilhameProductId`),
   * na mesma quantidade do produto pai. Se o vasilhame já estiver listado
   * explicitamente, não duplica.
   */
  private async expandItemsWithLinkedVasilhame(items: TransferLine[]): Promise<TransferLine[]> {
    const productIds = [...new Set(items.map((i) => i.productId))];
    if (productIds.length === 0) return items;

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, vasilhameProductId: true },
    });
    const vasilhameByProduct = new Map(
      products.map((p) => [p.id, p.vasilhameProductId] as const),
    );

    const explicitIds = new Set(items.map((i) => i.productId));
    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    for (const item of items) {
      const vasId = vasilhameByProduct.get(item.productId);
      if (!vasId || explicitIds.has(vasId)) continue;
      qtyByProduct.set(vasId, (qtyByProduct.get(vasId) ?? 0) + item.quantity);
    }

    return [...qtyByProduct.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  }

  private async assertStoresInOrganization(user: AuthUser, fromStoreId: string, toStoreId: string) {
    const stores = await this.prisma.store.findMany({
      where: {
        id: { in: [fromStoreId, toStoreId] },
        organizationId: user.organizationId,
      },
      select: { id: true },
    });
    if (stores.length !== 2) {
      throw new BadRequestException('Lojas de origem e destino inválidas para a organização');
    }
  }

  async create(user: AuthUser, input: unknown) {
    if (!canManageStock(user.role)) {
      throw new ForbiddenException('Sem permissão para transferir estoque.');
    }
    const data = createStockTransferSchema.parse(input);
    if (data.fromStoreId === data.toStoreId) {
      throw new BadRequestException('Lojas de origem e destino devem ser diferentes');
    }
    assertStoreAccess(user, data.fromStoreId);
    await this.assertStoresInOrganization(user, data.fromStoreId, data.toStoreId);

    const items = await this.expandItemsWithLinkedVasilhame(data.items);

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        fromStoreId: data.fromStoreId,
        toStoreId: data.toStoreId,
        notes: data.notes,
        status: StockTransferStatus.PENDING,
        items: { create: items },
      },
      include: { items: { include: { product: true } }, fromStore: true, toStore: true },
    });
    await this.audit.log(user, 'CREATE', 'StockTransfer', transfer.id);
    return transfer;
  }

  async updateStatus(user: AuthUser, id: string, input: unknown) {
    if (!canManageStock(user.role)) {
      throw new ForbiddenException('Sem permissão para alterar transferências de estoque.');
    }
    const { status } = updateStockTransferStatusSchema.parse(input);
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true, fromStore: true, toStore: true },
    });
    if (!transfer) throw new NotFoundException('Transferência não encontrada');
    if (
      transfer.fromStore.organizationId !== user.organizationId
      || transfer.toStore.organizationId !== user.organizationId
    ) {
      throw new ForbiddenException('Transferência fora da organização');
    }
    assertStoreAccess(user, transfer.toStoreId);

    if (status === 'COMPLETED') {
      // Expande de novo para cobrir transferências criadas antes desta regra
      // (ou itens sem o vasilhame listado).
      const moves = await this.expandItemsWithLinkedVasilhame(
        transfer.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      );

      return this.prisma.$transaction(async (tx) => {
        for (const item of moves) {
          await this.stockService.deductForTransfer(
            tx,
            transfer.fromStoreId,
            item.productId,
            item.quantity,
            user.id,
            transfer.id,
            transfer.toStore.name,
          );
          await this.stockService.addForTransfer(
            tx,
            transfer.toStoreId,
            item.productId,
            item.quantity,
            user.id,
            transfer.id,
            transfer.fromStore.name,
          );
        }
        return tx.stockTransfer.update({
          where: { id },
          data: { status: StockTransferStatus.COMPLETED, completedAt: new Date() },
          include: { items: { include: { product: true } }, fromStore: true, toStore: true },
        });
      });
    }

    return this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status:
          status === 'APPROVED'
            ? StockTransferStatus.APPROVED
            : StockTransferStatus.REJECTED,
      },
      include: { items: { include: { product: true } }, fromStore: true, toStore: true },
    });
  }
}
