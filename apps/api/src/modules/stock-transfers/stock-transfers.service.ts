import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StockTransferStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  canManageStock,
  createStockTransferSchema,
  updateStockTransferStatusSchema,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { StockService } from '../stock/stock.service';
import { AuditService } from '../../common/audit/audit.service';

type TransferLine = { productId: string; quantity: number };

@Injectable()
export class StockTransfersService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
  ) {}

  findAll(user: AuthUser, storeId?: string) {
    const storeFilter = storeId
      ? { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] }
      : user.role === 'ORG_MASTER'
        ? {
            OR: [
              { fromStore: { organizationId: user.organizationId } },
              { toStore: { organizationId: user.organizationId } },
            ],
          }
        : {
            OR: [
              { fromStoreId: { in: user.storeIds } },
              { toStoreId: { in: user.storeIds } },
            ],
          };

    return this.prisma.stockTransfer.findMany({
      where: storeFilter,
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

  async create(user: AuthUser, input: unknown) {
    if (!canManageStock(user.role)) {
      throw new ForbiddenException('Sem permissão para transferir estoque.');
    }
    const data = createStockTransferSchema.parse(input);
    if (data.fromStoreId === data.toStoreId) {
      throw new BadRequestException('Lojas de origem e destino devem ser diferentes');
    }
    assertStoreAccess(user, data.fromStoreId);

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
