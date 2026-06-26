import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import {
  PAYMENT_METHOD_LABELS,
  getBusinessDayBounds,
  getRouteDurationSeconds,
  getWaitTimeSeconds,
  toNumber,
} from '@gas-erp/shared';

const SLOW_DELIVERY_THRESHOLD_SECONDS = 900;

type DashboardPayload = {
  date: string;
  revenue: number;
  paymentsByMethod: Record<string, number>;
  productsSold: { name: string; qty: number; total: number }[];
  stockMovements: number;
  salesCount: number;
  deliveries: {
    pending: number;
    inProgress: number;
    completed: number;
  };
  deliveryMetrics: {
    avgWaitTimeSeconds: number | null;
    maxWaitTimeSeconds: number | null;
    avgRouteDurationSeconds: number | null;
    maxRouteDurationSeconds: number | null;
    pendingCount: number;
    inProgressCount: number;
    completedCount: number;
    slowDeliveries: {
      saleId: string;
      storeName?: string;
      customerName: string;
      delivererName: string;
      waitTimeSeconds: number | null;
      routeDurationSeconds: number | null;
    }[];
    byDeliverer: {
      delivererId: string;
      delivererName: string;
      deliveryCount: number;
      avgWaitTimeSeconds: number | null;
      avgRouteDurationSeconds: number | null;
    }[];
  };
};

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async masterOverview(user: AuthUser) {
    const { start, end, dateKey } = getBusinessDayBounds();

    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId, active: true },
    });

    const storeIds = stores.map((store) => store.id);

    const [storeStats, summary] = await Promise.all([
      Promise.all(
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
      ),
      this.computeDashboardForStores(storeIds, start, end, dateKey, true),
    ]);

    return { stores: storeStats, date: dateKey, summary };
  }

  async storeDashboard(user: AuthUser, storeId: string, date?: string) {
    assertStoreAccess(user, storeId);
    const { start, end, dateKey } = getBusinessDayBounds(date);
    return this.computeDashboardForStores([storeId], start, end, dateKey, false);
  }

  private emptyDashboard(dateKey: string): DashboardPayload {
    return {
      date: dateKey,
      revenue: 0,
      paymentsByMethod: {},
      productsSold: [],
      stockMovements: 0,
      salesCount: 0,
      deliveries: { pending: 0, inProgress: 0, completed: 0 },
      deliveryMetrics: {
        avgWaitTimeSeconds: null,
        maxWaitTimeSeconds: null,
        avgRouteDurationSeconds: null,
        maxRouteDurationSeconds: null,
        pendingCount: 0,
        inProgressCount: 0,
        completedCount: 0,
        slowDeliveries: [],
        byDeliverer: [],
      },
    };
  }

  private async computeDashboardForStores(
    storeIds: string[],
    start: Date,
    end: Date,
    dateKey: string,
    includeStoreNameInSlowDeliveries: boolean,
  ): Promise<DashboardPayload> {
    if (storeIds.length === 0) {
      return this.emptyDashboard(dateKey);
    }

    const storeFilter = { storeId: { in: storeIds } };

    const sales = await this.prisma.sale.findMany({
      where: {
        ...storeFilter,
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
        const key = item.product.name;
        if (!productsSold[key]) {
          productsSold[key] = { name: item.product.name, qty: 0, total: 0 };
        }
        productsSold[key].qty += item.quantity;
        productsSold[key].total += toNumber(item.total);
      }
    }

    const movements = await this.prisma.stockMovement.count({
      where: { ...storeFilter, createdAt: { gte: start, lt: end } },
    });

    const deliveries = await this.prisma.delivery.findMany({
      where: { sale: { ...storeFilter, createdAt: { gte: start, lt: end } } },
      include: {
        sale: {
          include: {
            customer: true,
            store: { select: { id: true, name: true } },
          },
        },
        deliverer: { include: { user: true } },
      },
    });

    const pendingDeliveries = deliveries.filter((d) => d.status === 'PENDING').length;
    const inProgressDeliveries = deliveries.filter((d) => d.status === 'IN_PROGRESS').length;
    const completedDeliveries = deliveries.filter((d) => d.status === 'DELIVERED').length;

    const waitTimes: number[] = [];
    const routeTimes: number[] = [];
    const slowDeliveries: DashboardPayload['deliveryMetrics']['slowDeliveries'] = [];
    const delivererStats = new Map<
      string,
      { delivererName: string; waitTimes: number[]; routeTimes: number[]; deliveryCount: number }
    >();

    for (const delivery of deliveries) {
      const delivererName = delivery.deliverer.user.name;
      const waitTimeSeconds = getWaitTimeSeconds(delivery.sale.createdAt, delivery.startedAt);
      const routeDurationSeconds = getRouteDurationSeconds(delivery.startedAt, delivery.completedAt);

      if (waitTimeSeconds != null) waitTimes.push(waitTimeSeconds);
      if (routeDurationSeconds != null) routeTimes.push(routeDurationSeconds);

      const stats = delivererStats.get(delivery.delivererId) ?? {
        delivererName,
        waitTimes: [],
        routeTimes: [],
        deliveryCount: 0,
      };
      stats.deliveryCount += 1;
      if (waitTimeSeconds != null) stats.waitTimes.push(waitTimeSeconds);
      if (routeDurationSeconds != null) stats.routeTimes.push(routeDurationSeconds);
      delivererStats.set(delivery.delivererId, stats);

      const isSlowWait = waitTimeSeconds != null && waitTimeSeconds > SLOW_DELIVERY_THRESHOLD_SECONDS;
      const isSlowRoute = routeDurationSeconds != null && routeDurationSeconds > SLOW_DELIVERY_THRESHOLD_SECONDS;
      if (isSlowWait || isSlowRoute) {
        slowDeliveries.push({
          saleId: delivery.saleId,
          ...(includeStoreNameInSlowDeliveries
            ? { storeName: delivery.sale.store.name }
            : {}),
          customerName: delivery.sale.customer?.name ?? 'Cliente avulso',
          delivererName,
          waitTimeSeconds,
          routeDurationSeconds,
        });
      }
    }

    const avgWaitTimeSeconds = waitTimes.length
      ? Math.round(waitTimes.reduce((sum, value) => sum + value, 0) / waitTimes.length)
      : null;
    const maxWaitTimeSeconds = waitTimes.length ? Math.max(...waitTimes) : null;
    const avgRouteDurationSeconds = routeTimes.length
      ? Math.round(routeTimes.reduce((sum, value) => sum + value, 0) / routeTimes.length)
      : null;
    const maxRouteDurationSeconds = routeTimes.length ? Math.max(...routeTimes) : null;
    slowDeliveries.sort((a, b) => {
      const aMax = Math.max(a.waitTimeSeconds ?? 0, a.routeDurationSeconds ?? 0);
      const bMax = Math.max(b.waitTimeSeconds ?? 0, b.routeDurationSeconds ?? 0);
      return bMax - aMax;
    });

    const byDeliverer = Array.from(delivererStats.entries())
      .map(([delivererId, stats]) => ({
        delivererId,
        delivererName: stats.delivererName,
        deliveryCount: stats.deliveryCount,
        avgWaitTimeSeconds: stats.waitTimes.length
          ? Math.round(stats.waitTimes.reduce((sum, value) => sum + value, 0) / stats.waitTimes.length)
          : null,
        avgRouteDurationSeconds: stats.routeTimes.length
          ? Math.round(stats.routeTimes.reduce((sum, value) => sum + value, 0) / stats.routeTimes.length)
          : null,
      }))
      .sort((a, b) => a.delivererName.localeCompare(b.delivererName, 'pt-BR'));

    return {
      date: dateKey,
      revenue,
      paymentsByMethod,
      productsSold: Object.values(productsSold).sort((a, b) => b.total - a.total),
      stockMovements: movements,
      salesCount: sales.length,
      deliveries: {
        pending: pendingDeliveries,
        inProgress: inProgressDeliveries,
        completed: completedDeliveries,
      },
      deliveryMetrics: {
        avgWaitTimeSeconds,
        maxWaitTimeSeconds,
        avgRouteDurationSeconds,
        maxRouteDurationSeconds,
        pendingCount: pendingDeliveries,
        inProgressCount: inProgressDeliveries,
        completedCount: completedDeliveries,
        slowDeliveries,
        byDeliverer,
      },
    };
  }
}
