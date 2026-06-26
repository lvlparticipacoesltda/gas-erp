import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  DashboardDateQuery,
  PAYMENT_METHOD_LABELS,
  formatDashboardDateRangeLabel,
  getRouteDurationSeconds,
  getWaitTimeSeconds,
  resolveDashboardDateRange,
  toNumber,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';

const SLOW_DELIVERY_THRESHOLD_SECONDS = 900;

type DashboardPayload = {
  date: string;
  dateFrom: string;
  dateTo: string;
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

  async masterOverview(user: AuthUser, dateQuery: DashboardDateQuery = {}) {
    const { start, end, dateFrom, dateTo } = this.resolveRange(dateQuery);
    const dateLabel = formatDashboardDateRangeLabel(dateFrom, dateTo);

    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId, active: true },
    });

    const storeIds = stores.map((store) => store.id);

    const [storeStats, summary] = await Promise.all([
      Promise.all(
        stores.map(async (store) => {
          const [salesInPeriod, activeDeliveries, lowStock] = await Promise.all([
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
            salesCount: salesInPeriod._count._all,
            salesTotal: toNumber(salesInPeriod._sum.total),
            activeDeliveries,
            lowStockItems: lowStock,
          };
        }),
      ),
      this.computeDashboardForStores(storeIds, start, end, dateFrom, dateTo, true),
    ]);

    return { stores: storeStats, date: dateLabel, dateFrom, dateTo, summary };
  }

  async storeDashboard(user: AuthUser, storeId: string, dateQuery: DashboardDateQuery = {}) {
    assertStoreAccess(user, storeId);
    const { start, end, dateFrom, dateTo } = this.resolveRange(dateQuery);
    return this.computeDashboardForStores([storeId], start, end, dateFrom, dateTo, false);
  }

  private resolveRange(dateQuery: DashboardDateQuery) {
    try {
      return resolveDashboardDateRange(dateQuery);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Período inválido',
      );
    }
  }

  private emptyDashboard(dateFrom: string, dateTo: string): DashboardPayload {
    return {
      date: formatDashboardDateRangeLabel(dateFrom, dateTo),
      dateFrom,
      dateTo,
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
    dateFrom: string,
    dateTo: string,
    includeStoreNameInSlowDeliveries: boolean,
  ): Promise<DashboardPayload> {
    if (storeIds.length === 0) {
      return this.emptyDashboard(dateFrom, dateTo);
    }

    const storeFilter = { storeId: { in: storeIds } };

    const saleWhere = {
      ...storeFilter,
      createdAt: { gte: start, lt: end },
      status: { not: SaleStatus.CANCELLED },
    };

    const [saleAgg, paymentGroups, itemGroups, movements, deliveries] = await Promise.all([
      this.prisma.sale.aggregate({
        where: saleWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.salePayment.groupBy({
        by: ['method'],
        where: { sale: saleWhere },
        _sum: { amount: true },
      }),
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: { sale: saleWhere },
        _sum: { quantity: true, total: true },
      }),
      this.prisma.stockMovement.count({
        where: { ...storeFilter, createdAt: { gte: start, lt: end } },
      }),
      this.prisma.delivery.findMany({
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
      }),
    ]);

    const revenue = toNumber(saleAgg._sum.total);
    const salesCount = saleAgg._count._all;

    const paymentsByMethod: Record<string, number> = {};
    for (const group of paymentGroups) {
      const label = PAYMENT_METHOD_LABELS[group.method] ?? group.method;
      paymentsByMethod[label] = (paymentsByMethod[label] ?? 0) + toNumber(group._sum.amount);
    }

    const productIds = itemGroups.map((group) => group.productId);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productNameById = new Map(products.map((product) => [product.id, product.name]));
    const productsSold = itemGroups
      .map((group) => ({
        name: productNameById.get(group.productId) ?? 'Produto',
        qty: group._sum.quantity ?? 0,
        total: toNumber(group._sum.total),
      }))
      .sort((a, b) => b.total - a.total);

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
      date: formatDashboardDateRangeLabel(dateFrom, dateTo),
      dateFrom,
      dateTo,
      revenue,
      paymentsByMethod,
      productsSold,
      stockMovements: movements,
      salesCount,
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
