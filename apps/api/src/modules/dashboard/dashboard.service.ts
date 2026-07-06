import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  aggregateDelivererRouteStats,
  AuthUser,
  COUNTED_BACKDATE_APPROVALS,
  COUNTED_MOBILE_APPROVALS,
  COUNTED_SALE_STATUSES,
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
  toNumber,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { resolveDashboardDateRange } from '../../common/utils/business-day';

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
    cancelled: number;
  };
  deliveryMetrics: {
    avgWaitTimeSeconds: number | null;
    maxWaitTimeSeconds: number | null;
    avgRouteDurationSeconds: number | null;
    maxRouteDurationSeconds: number | null;
    avgTotalDeliveryTimeSeconds: number | null;
    maxTotalDeliveryTimeSeconds: number | null;
    pendingCount: number;
    inProgressCount: number;
    completedCount: number;
    cancelledCount: number;
    slowDeliveries: {
      saleId: string;
      storeName?: string;
      customerName: string;
      delivererName: string;
      waitTimeSeconds: number | null;
      routeDurationSeconds: number | null;
      totalDeliveryTimeSeconds: number | null;
    }[];
    byDeliverer: {
      delivererId: string;
      delivererName: string;
      completedCount: number;
      cancelledCount: number;
      avgWaitTimeSeconds: number | null;
      avgRouteDurationSeconds: number | null;
      avgTotalDeliveryTimeSeconds: number | null;
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

    const sharedSaleWhere = {
      storeId: { in: storeIds },
      saleDate: { gte: start, lt: end },
      backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
      mobileApproval: { in: COUNTED_MOBILE_APPROVALS },
      status: { in: [...COUNTED_SALE_STATUSES] as SaleStatus[] },
    };

    const [salesGrouped, activeDeliveries, summary, saleItemsByStore, paymentsByStore] =
      await Promise.all([
        storeIds.length
          ? this.prisma.sale.groupBy({
              by: ['storeId'],
              where: sharedSaleWhere,
              _sum: { total: true },
              _count: { _all: true },
            })
          : Promise.resolve([]),
        storeIds.length
          ? this.prisma.delivery.findMany({
              where: {
                status: { in: ['PENDING', 'IN_PROGRESS'] },
                sale: { storeId: { in: storeIds } },
              },
              select: { sale: { select: { storeId: true } } },
            })
          : Promise.resolve([]),
        this.computeDashboardForStores(storeIds, start, end, dateFrom, dateTo, true, user),
        showFinancial && storeIds.length
          ? this.prisma.saleItem.findMany({
              where: { sale: sharedSaleWhere },
              select: {
                quantity: true,
                unitCost: true,
                sale: { select: { storeId: true } },
              },
            })
          : Promise.resolve([]),
        showFinancial && storeIds.length
          ? this.prisma.salePayment.findMany({
              where: { sale: sharedSaleWhere },
              select: {
                processingFee: true,
                sale: { select: { storeId: true } },
              },
            })
          : Promise.resolve([]),
      ]);

    const salesByStoreId = new Map(salesGrouped.map((row) => [row.storeId, row]));
    const activeDeliveriesByStoreId = new Map<string, number>();
    for (const delivery of activeDeliveries) {
      const storeId = delivery.sale.storeId;
      activeDeliveriesByStoreId.set(storeId, (activeDeliveriesByStoreId.get(storeId) ?? 0) + 1);
    }

    const cogsByStoreId = new Map<string, number>();
    for (const item of saleItemsByStore) {
      const storeId = item.sale.storeId;
      const lineCogs = item.quantity * toNumber(item.unitCost);
      cogsByStoreId.set(storeId, (cogsByStoreId.get(storeId) ?? 0) + lineCogs);
    }

    const feesByStoreId = new Map<string, number>();
    for (const payment of paymentsByStore) {
      const storeId = payment.sale.storeId;
      feesByStoreId.set(
        storeId,
        (feesByStoreId.get(storeId) ?? 0) + toNumber(payment.processingFee),
      );
    }

    const storeStats = stores.map((store) => {
      const salesInPeriod = salesByStoreId.get(store.id);
      const salesTotal = toNumber(salesInPeriod?._sum.total);
      const salesCount = salesInPeriod?._count._all ?? 0;
      const activeDeliveryCount = activeDeliveriesByStoreId.get(store.id) ?? 0;

      const financialSummary =
        showFinancial
          ? (() => {
              const totalCost = cogsByStoreId.get(store.id) ?? 0;
              const grossProfit = computeGrossProfit(salesTotal, totalCost);
              const totalProcessingFees = feesByStoreId.get(store.id) ?? 0;
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
        salesCount,
        salesTotal,
        activeDeliveries: activeDeliveryCount,
        ...financialSummary,
      };
    });

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
      deliveries: { pending: 0, inProgress: 0, completed: 0, cancelled: 0 },
      deliveryMetrics: {
        avgWaitTimeSeconds: null,
        maxWaitTimeSeconds: null,
        avgRouteDurationSeconds: null,
        maxRouteDurationSeconds: null,
        avgTotalDeliveryTimeSeconds: null,
        maxTotalDeliveryTimeSeconds: null,
        pendingCount: 0,
        inProgressCount: 0,
        completedCount: 0,
        cancelledCount: 0,
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
      status: { in: [...COUNTED_SALE_STATUSES] as SaleStatus[] },
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
        select: {
          status: true,
          delivererId: true,
          saleId: true,
          startedAt: true,
          completedAt: true,
          sale: {
            select: {
              createdAt: true,
              customer: { select: { name: true } },
              store: { select: { id: true, name: true } },
            },
          },
          deliverer: { select: { user: { select: { name: true } } } },
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

    const routeStats = aggregateDelivererRouteStats(
      deliveries.map((delivery) => ({
        status: delivery.status,
        delivererId: delivery.delivererId,
        delivererName: delivery.deliverer.user.name,
        saleId: delivery.saleId,
        saleCreatedAt: delivery.sale.createdAt,
        startedAt: delivery.startedAt,
        completedAt: delivery.completedAt,
        customerName: delivery.sale.customer?.name ?? undefined,
        ...(includeStoreNameInSlowDeliveries
          ? { storeName: delivery.sale.store.name }
          : {}),
      })),
    );

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
        pending: routeStats.counts.pending,
        inProgress: routeStats.counts.inProgress,
        completed: routeStats.counts.completed,
        cancelled: routeStats.counts.cancelled,
      },
      deliveryMetrics: {
        avgWaitTimeSeconds: routeStats.avgWaitTimeSeconds,
        maxWaitTimeSeconds: routeStats.maxWaitTimeSeconds,
        avgRouteDurationSeconds: routeStats.avgRouteDurationSeconds,
        maxRouteDurationSeconds: routeStats.maxRouteDurationSeconds,
        avgTotalDeliveryTimeSeconds: routeStats.avgTotalDeliveryTimeSeconds,
        maxTotalDeliveryTimeSeconds: routeStats.maxTotalDeliveryTimeSeconds,
        pendingCount: routeStats.counts.pending,
        inProgressCount: routeStats.counts.inProgress,
        completedCount: routeStats.counts.completed,
        cancelledCount: routeStats.counts.cancelled,
        slowDeliveries: routeStats.slowDeliveries,
        byDeliverer: routeStats.byDeliverer,
      },
    };
  }
}
