import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryStatus, SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { createSaleSchema, updateSaleStatusSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { StockService } from '../stock/stock.service';
import { AuditService } from '../../common/audit/audit.service';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
  ) {}

  private saleInclude = {
    customer: true,
    attendant: { select: { id: true, name: true } },
    deliverer: { include: { user: { select: { id: true, name: true } } } },
    items: { include: { product: true } },
    payments: true,
    delivery: true,
    statusLogs: { orderBy: { createdAt: 'asc' as const } },
  };

  async findAll(
    user: AuthUser,
    storeId: string,
    status?: string,
    page = 1,
    pageSize = 20,
  ) {
    assertStoreAccess(user, storeId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = {
      storeId,
      ...(status ? { status: status as SaleStatus } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take,
        include: this.saleInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);
    return paginatedResult(data, total, p, ps);
  }

  async findOne(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { ...this.saleInclude, store: true },
    });
    if (!sale || sale.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Venda não encontrada');
    }
    assertStoreAccess(user, sale.storeId);
    return sale;
  }

  async create(user: AuthUser, input: unknown) {
    const data = createSaleSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    const total = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice - (item.discount ?? 0),
      0,
    );

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          storeId: data.storeId,
          customerId: data.customerId,
          attendantId: user.id,
          delivererId: data.delivererId,
          channel: data.channel ?? 'PHONE',
          status: SaleStatus.CONFIRMED,
          total,
          notes: data.notes,
          deliveryStreet: data.deliveryStreet,
          deliveryNumber: data.deliveryNumber,
          deliveryComplement: data.deliveryComplement,
          deliveryNeighborhood: data.deliveryNeighborhood,
          deliveryCity: data.deliveryCity,
          deliveryState: data.deliveryState,
          deliveryLandmark: data.deliveryLandmark,
          confirmedAt: new Date(),
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              total: item.quantity * item.unitPrice - (item.discount ?? 0),
            })),
          },
          payments: data.payments?.length
            ? { create: data.payments }
            : undefined,
          statusLogs: { create: { status: SaleStatus.CONFIRMED, userId: user.id } },
        },
        include: this.saleInclude,
      });

      for (const item of data.items) {
        await this.stockService.deductForSale(
          tx,
          data.storeId,
          item.productId,
          item.quantity,
          user.id,
          created.id,
        );
      }

      if (data.delivererId) {
        await tx.sale.update({
          where: { id: created.id },
          data: { status: SaleStatus.IN_DELIVERY },
        });
        await tx.delivery.create({
          data: {
            saleId: created.id,
            delivererId: data.delivererId,
            status: DeliveryStatus.PENDING,
          },
        });
        await tx.saleStatusLog.create({
          data: { saleId: created.id, status: SaleStatus.IN_DELIVERY, userId: user.id },
        });
      }

      return tx.sale.findUnique({
        where: { id: created.id },
        include: this.saleInclude,
      });
    });

    await this.audit.log(user, 'CREATE', 'Sale', sale!.id);
    return sale;
  }

  async updateStatus(user: AuthUser, id: string, input: unknown) {
    const data = updateSaleStatusSchema.parse(input);
    const sale = await this.findOne(user, id);

    if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.DELIVERED) {
      throw new BadRequestException('Venda não pode ser alterada');
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.status === 'CANCELLED') {
        for (const item of sale.items) {
          await this.stockService.restoreForCancelledSale(
            tx,
            sale.storeId,
            item.productId,
            item.quantity,
            user.id,
            sale.id,
          );
        }
      }

      const updated = await tx.sale.update({
        where: { id },
        data: {
          status: data.status as SaleStatus,
          delivererId: data.delivererId ?? sale.delivererId,
          canceledReason: data.canceledReason,
          canceledAt: data.status === 'CANCELLED' ? new Date() : undefined,
          deliveredAt: data.status === 'DELIVERED' ? new Date() : undefined,
        },
        include: this.saleInclude,
      });

      await tx.saleStatusLog.create({
        data: { saleId: id, status: data.status as SaleStatus, userId: user.id },
      });

      if (data.status === 'IN_DELIVERY' && data.delivererId) {
        await tx.delivery.upsert({
          where: { saleId: id },
          update: { delivererId: data.delivererId, status: DeliveryStatus.PENDING },
          create: {
            saleId: id,
            delivererId: data.delivererId,
            status: DeliveryStatus.PENDING,
          },
        });
      }

      if (data.status === 'DELIVERED' && sale.delivery) {
        await tx.delivery.update({
          where: { saleId: id },
          data: { status: DeliveryStatus.DELIVERED, completedAt: new Date() },
        });
      }

      await this.audit.log(user, 'UPDATE_STATUS', 'Sale', id, { status: data.status });
      return updated;
    });
  }
}
