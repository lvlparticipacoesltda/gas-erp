import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  COUNTED_BACKDATE_APPROVALS,
  COUNTED_MOBILE_APPROVALS,
  DashboardDateQuery,
  PAYMENT_METHOD_LABELS,
  canViewFinancialMargins,
  computeGrossMarginPercent,
  computeGrossProfit,
  computeNetMarginPercent,
  computeNetProfit,
  computeNetRevenue,
  computeSaleCogs,
  formatDashboardDateRangeLabel,
  getRouteDurationSeconds,
  getWaitTimeSeconds,
  toNumber,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { resolveDashboardDateRange } from '../../common/utils/business-day';

const SLOW_DELIVERY_THRESHOLD_SECONDS = 900;

type DashboardPayload = {
  date: string;
  dateFrom: string;
  dateTo: string;
  revenue: number;
  totalCost?: number;
  grossProfit?: number;
  grossMarginPercent?: number | null;
  totalProcessingFees?: number;
  netRevenue?: number;
  netProfit?: number;
  netMarginPercent?: number | null;
  paymentsByMethod: {
    label: string;
    revenue: number;
    processingFees?: number;
    netRevenue?: number;
    totalCost?: number;
    grossProfit?: number;
    netProfit?: number;
  }[];
  productsSold: {
    name: string;
    qty: number;
    total: number;
    totalCost?: number;
    grossProfit?: number;
  }[];
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

    const showFinancial = canViewFinancialMargins(user.role);
    const storeSaleWhere = (storeId: string) => ({
      storeId,
      saleDate: { gte: start, lt: end },
      backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
      mobileApproval: { in: COUNTED_MOBILE_APPROVALS },
      status: { not: SaleStatus.CANCELLED },
    });

    const [storeStats, summary] = await Promise.all([
      Promise.all(
        stores.map(async (store) => {
          const saleWhere = storeSaleWhere(store.id);
          const [salesInPeriod, activeDeliveries, saleItems] = await Promise.all([
            this.prisma.sale.aggregate({
              where: saleWhere,
              _sum: { total: true },
              _count: { _all: true },
            }),
            this.prisma.delivery.count({
              where: {
                sale: { storeId: store.id },
                status: { in: ['PENDING', 'IN_PROGRESS'] },
              },
            }),
            showFinancial
              ? this.prisma.saleItem.findMany({
                  where: { sale: saleWhere },
                  select: { quantity: true, unitCost: true },
                })
              : Promise.resolve([]),
          ]);

          const salesTotal = toNumber(salesInPeriod._sum.total);
          const financialSummary = showFinancial
            ? await (async () => {
                const totalCost = computeSaleCogs(saleItems);
                const grossProfit = computeGrossProfit(salesTotal, totalCost);
                const feeAgg = await this.prisma.salePayment.aggregate({
                  where: { sale: saleWhere },
                  _sum: { processingFee: true },
                });
                const totalProcessingFees = toNumber(feeAgg._sum.processingFee);
                const netRevenue = computeNetRevenue(salesTotal, totalProcessingFees);
                const netProfit = computeNetProfit(grossProfit, totalProcessingFees);
                return {
                  totalCost,
                  grossProfit,
                  totalProcessingFees,
                  netRevenue,
                  netProfit,
                };
              })()
            : {};

          return {
            store,
            salesCount: salesInPeriod._count._all,
            salesTotal,
            activeDeliveries,
            ...financialSummary,
          };
        }),
      ),
      this.computeDashboardForStores(storeIds, start, end, dateFrom, dateTo, true, user),
    ]);

    return { stores: storeStats, date: dateLabel, dateFrom, dateTo, summary };
  }

  async storeDashboard(user: AuthUser, storeId: string, dateQuery: DashboardDateQuery = {}) {
    assertStoreAccess(user, storeId);
    const { start, end, dateFrom, dateTo } = this.resolveRange(dateQuery);
    return this.computeDashboardForStores([storeId], start, end, dateFrom, dateTo, false, user);
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
      paymentsByMethod: [] as DashboardPayload['paymentsByMethod'],
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
    user: AuthUser,
  ): Promise<DashboardPayload> {
    if (storeIds.length === 0) {
      return this.emptyDashboard(dateFrom, dateTo);
    }

    const storeFilter = { storeId: { in: storeIds } };

    const saleWhere = {
      ...storeFilter,
      saleDate: { gte: start, lt: end },
      backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
      mobileApproval: { in: COUNTED_MOBILE_APPROVALS },
      status: { not: SaleStatus.CANCELLED },
    };

    const showFinancial = canViewFinancialMargins(user.role);

    const [saleAgg, paymentRows, itemGroups, movements, deliveries, saleItemsDetail, salesForPaymentAlloc] =
      await Promise.all([
      this.prisma.sale.aggregate({
        where: saleWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.salePayment.findMany({
        where: { sale: saleWhere },
        select: {
          amount: true,
          processingFee: true,
          method: true,
          storePaymentMethod: { select: { label: true } },
        },
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
        where: {
          sale: {
            ...storeFilter,
            saleDate: { gte: start, lt: end },
            backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
            mobileApproval: { in: COUNTED_MOBILE_APPROVALS },
          },
        },
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
      showFinancial
        ? this.prisma.saleItem.findMany({
            where: { sale: saleWhere },
            select: { productId: true, quantity: true, total: true, unitCost: true },
          })
        : Promise.resolve([]),
      showFinancial
        ? this.prisma.sale.findMany({
            where: saleWhere,
            select: {
              total: true,
              payments: {
                select: {
                  method: true,
                  amount: true,
                  processingFee: true,
                  storePaymentMethod: { select: { label: true } },
                },
              },
              items: { select: { quantity: true, unitCost: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const revenue = toNumber(saleAgg._sum.total);
    const salesCount = saleAgg._count._all;

    type PaymentMethodStats = {
      revenue: number;
      processingFees: number;
      totalCost: number;
    };
    const paymentStatsByLabel = new Map<string, PaymentMethodStats>();

    const paymentLabel = (payment: {
      method: string;
      storePaymentMethod?: { label: string } | null;
    }) => payment.storePaymentMethod?.label ?? PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;

    for (const payment of paymentRows) {
      const label = paymentLabel(payment);
      const acc = paymentStatsByLabel.get(label) ?? { revenue: 0, processingFees: 0, totalCost: 0 };
      acc.revenue += toNumber(payment.amount);
      acc.processingFees += toNumber(payment.processingFee);
      paymentStatsByLabel.set(label, acc);
    }

    if (showFinancial) {
      for (const sale of salesForPaymentAlloc) {
        const saleTotal = toNumber(sale.total);
        const cogs = computeSaleCogs(sale.items);
        for (const payment of sale.payments) {
          const label = paymentLabel(payment);
          const amount = toNumber(payment.amount);
          const allocatedCost = saleTotal > 0 ? (amount / saleTotal) * cogs : 0;
          const acc = paymentStatsByLabel.get(label) ?? { revenue: 0, processingFees: 0, totalCost: 0 };
          acc.totalCost += allocatedCost;
          paymentStatsByLabel.set(label, acc);
        }
      }
    }

    const paymentsByMethod = Array.from(paymentStatsByLabel.entries())
      .map(([label, stats]) => {
        const grossProfit = showFinancial
          ? computeGrossProfit(stats.revenue, stats.totalCost)
          : undefined;
        const netRevenue = computeNetRevenue(stats.revenue, stats.processingFees);
        const netProfit =
          grossProfit != null
            ? computeNetProfit(grossProfit, stats.processingFees)
            : undefined;
        return {
          label,
          revenue: stats.revenue,
          ...(showFinancial
            ? {
                processingFees: stats.processingFees,
                netRevenue,
                totalCost: stats.totalCost,
                grossProfit,
                netProfit,
              }
            : {}),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const productIds = showFinancial
      ? [...new Set(saleItemsDetail.map((item) => item.productId))]
      : itemGroups.map((group) => group.productId);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productNameById = new Map(products.map((product) => [product.id, product.name]));

    const productsSold = showFinancial
      ? (() => {
          const byProduct = new Map<string, { qty: number; total: number; totalCost: number }>();
          for (const item of saleItemsDetail) {
            const acc = byProduct.get(item.productId) ?? { qty: 0, total: 0, totalCost: 0 };
            acc.qty += item.quantity;
            acc.total += toNumber(item.total);
            acc.totalCost += item.quantity * toNumber(item.unitCost);
            byProduct.set(item.productId, acc);
          }
          return Array.from(byProduct.entries())
            .map(([productId, stats]) => ({
              name: productNameById.get(productId) ?? 'Produto',
              qty: stats.qty,
              total: stats.total,
              totalCost: stats.totalCost,
              grossProfit: computeGrossProfit(stats.total, stats.totalCost),
            }))
            .sort((a, b) => b.total - a.total);
        })()
      : itemGroups
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

    const financialSummary = showFinancial
      ? (() => {
          const totalCost = computeSaleCogs(saleItemsDetail);
          const grossProfit = computeGrossProfit(revenue, totalCost);
          const totalProcessingFees = paymentRows.reduce(
            (sum, payment) => sum + toNumber(payment.processingFee),
            0,
          );
          const netRevenue = computeNetRevenue(revenue, totalProcessingFees);
          const netProfit = computeNetProfit(grossProfit, totalProcessingFees);
          return {
            totalCost,
            grossProfit,
            grossMarginPercent: computeGrossMarginPercent(revenue, grossProfit),
            totalProcessingFees,
            netRevenue,
            netProfit,
            netMarginPercent: computeNetMarginPercent(netRevenue, netProfit),
          };
        })()
      : {};

    return {
      date: formatDashboardDateRangeLabel(dateFrom, dateTo),
      dateFrom,
      dateTo,
      revenue,
      ...financialSummary,
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
