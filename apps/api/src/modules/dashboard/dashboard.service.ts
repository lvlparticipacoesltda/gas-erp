import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import {
  PAYMENT_METHOD_LABELS,
  getBusinessDayBounds,
  getWaitTimeSeconds,
  toNumber,
} from '@gas-erp/shared';

const SLOW_DELIVERY_THRESHOLD_SECONDS = 900;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async masterOverview(user: AuthUser) {
    const { start, end } = getBusinessDayBounds();

    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId, active: true },
    });

    const storeStats = await Promise.all(
      stores.map(async (store) => {
        const [salesToday, activeDeliveries, lowStock] = await Promise.all([
          this.prisma.sale.aggregate({
            where: {
              storeId: store.id,
              createdAt: { gte: start, lt: end },
              status: { not: SaleStatus.CANCELLED },
            },
            _sum: { total: true },
            _count: { _all: true },
          }),
          this.prisma.delivery.count({
            where: {
              sale: { storeId: store.id },
              status: { in: ['PENDING', 'IN_PROGRESS'] },
            },
          }),
          this.prisma.stockBalance.count({
            where: { storeId: store.id, available: { lte: 10 } },
          }),
        ]);
        return {
          store,
          salesCount: salesToday._count._all,
          salesTotal: toNumber(salesToday._sum.total),
          activeDeliveries,
          lowStockItems: lowStock,
        };
      }),
    );

    return { stores: storeStats, date: getBusinessDayBounds().dateKey };
  }

  async storeDashboard(user: AuthUser, storeId: string, date?: string) {
    assertStoreAccess(user, storeId);
    const { start, end, dateKey } = getBusinessDayBounds(date);

    const sales = await this.prisma.sale.findMany({
      where: {
        storeId,
        createdAt: { gte: start, lt: end },
        status: { not: SaleStatus.CANCELLED },
      },
      include: { items: { include: { product: true } }, payments: true },
    });

    const paymentsByMethod: Record<string, number> = {};
    let revenue = 0;
    const productsSold: Record<string, { name: string; qty: number; total: number }> = {};

    for (const sale of sales) {
      revenue += toNumber(sale.total);
      for (const payment of sale.payments) {
        const label = PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
        paymentsByMethod[label] = (paymentsByMethod[label] ?? 0) + toNumber(payment.amount);
      }
      for (const item of sale.items) {
        const key = item.productId;
        if (!productsSold[key]) {
          productsSold[key] = { name: item.product.name, qty: 0, total: 0 };
        }
        productsSold[key].qty += item.quantity;
        productsSold[key].total += toNumber(item.total);
      }
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: { storeId, createdAt: { gte: start, lt: end } },
      include: { product: true },
    });

    const deliveries = await this.prisma.delivery.findMany({
      where: { sale: { storeId, createdAt: { gte: start, lt: end } } },
      include: { sale: { include: { customer: true } } },
    });

    const pendingDeliveries = deliveries.filter((d) => d.status === 'PENDING').length;
    const inProgressDeliveries = deliveries.filter((d) => d.status === 'IN_PROGRESS').length;
    const completedDeliveries = deliveries.filter((d) => d.status === 'DELIVERED').length;

    const waitTimes: number[] = [];
    const slowDeliveries: { saleId: string; customerName: string; waitTimeSeconds: number }[] = [];
    for (const delivery of deliveries) {
      const waitTimeSeconds = getWaitTimeSeconds(delivery.sale.createdAt, delivery.startedAt);
      if (waitTimeSeconds == null) continue;
      waitTimes.push(waitTimeSeconds);
      if (waitTimeSeconds > SLOW_DELIVERY_THRESHOLD_SECONDS) {
        slowDeliveries.push({
          saleId: delivery.saleId,
          customerName: delivery.sale.customer?.name ?? 'Cliente avulso',
          waitTimeSeconds,
        });
      }
    }

    const avgWaitTimeSeconds = waitTimes.length
      ? Math.round(waitTimes.reduce((sum, value) => sum + value, 0) / waitTimes.length)
      : null;
    const maxWaitTimeSeconds = waitTimes.length ? Math.max(...waitTimes) : null;
    slowDeliveries.sort((a, b) => b.waitTimeSeconds - a.waitTimeSeconds);

    return {
      date: dateKey,
      revenue,
      paymentsByMethod,
      productsSold: Object.values(productsSold),
      stockMovements: movements.length,
      salesCount: sales.length,
      deliveries: {
        pending: pendingDeliveries,
        inProgress: inProgressDeliveries,
        completed: completedDeliveries,
      },
      deliveryMetrics: {
        avgWaitTimeSeconds,
        maxWaitTimeSeconds,
        pendingCount: pendingDeliveries,
        inProgressCount: inProgressDeliveries,
        completedCount: completedDeliveries,
        slowDeliveries,
      },
    };
  }
}
