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
  stockGlp: {
    products: {
      productId: string;
      name: string;
      sku: string;
      opening: number;
      out: number;
      closing: number;
    }[];
    totals: { opening: number; out: number; closing: number };
  };
  glpQuantitySold: number;
  gasDoPovo: {
    quantity: number;
    revenue: number;
    salesCount: number;
  };
  portaria: {
    salesCount: number;
    glpQuantity: number;
  };
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
      glpQuantity: number;
      gdpQuantity: number;
      gdpRevenue: number;
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
      stockGlp: { products: [], totals: { opening: 0, out: 0, closing: 0 } },
      glpQuantitySold: 0,
      gasDoPovo: { quantity: 0, revenue: 0, salesCount: 0 },
      portaria: { salesCount: 0, glpQuantity: 0 },
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

    const [
      saleAgg,
      paymentRows,
      itemGroups,
      deliveries,
      saleItemsDetail,
      salesForPaymentAlloc,
      salesForGdpGlp,
      gdpMethods,
      glpBalances,
      glpMovements,
    ] = await Promise.all([
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
      this.prisma.sale.findMany({
        where: saleWhere,
        select: {
          status: true,
          delivererId: true,
          gasDoPovoBenefit: true,
          items: {
            select: {
              quantity: true,
              storePaymentMethodId: true,
              product: { select: { productType: true } },
            },
          },
          payments: {
            select: {
              amount: true,
              method: true,
              storePaymentMethodId: true,
            },
          },
        },
      }),
      this.prisma.storePaymentMethod.findMany({
        where: { storeId: { in: storeIds }, systemCode: 'GDP' },
        select: { id: true },
      }),
      this.prisma.stockBalance.findMany({
        where: {
          ...storeFilter,
          product: { productType: { equals: 'GLP', mode: 'insensitive' } },
        },
        select: {
          available: true,
          product: { select: { id: true, name: true, sku: true } },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          ...storeFilter,
          createdAt: { gte: start },
          product: { productType: { equals: 'GLP', mode: 'insensitive' } },
        },
        select: { productId: true, type: true, quantity: true, createdAt: true },
      }),
    ]);

    const revenue = toNumber(saleAgg._sum.total);
    const salesCount = saleAgg._count._all;

    const gdpMethodIds = new Set(gdpMethods.map((m) => m.id));
    const isGlp = (productType: string | null | undefined) =>
      (productType ?? '').toUpperCase() === 'GLP';

    let glpQuantitySold = 0;
    let gdpQuantity = 0;
    let gdpRevenue = 0;
    let gdpSalesCount = 0;
    let portariaSalesCount = 0;
    let portariaGlpQuantity = 0;
    const glpQuantityByDelivererId = new Map<string, number>();
    const gdpQuantityByDelivererId = new Map<string, number>();
    const gdpRevenueByDelivererId = new Map<string, number>();

    for (const sale of salesForGdpGlp) {
      const saleGlpQty = sale.items.reduce(
        (sum, item) => (isGlp(item.product.productType) ? sum + item.quantity : sum),
        0,
      );
      glpQuantitySold += saleGlpQty;

      if (sale.status === 'PORTARIA') {
        portariaSalesCount += 1;
        portariaGlpQuantity += saleGlpQty;
      }

      const saleGdpRevenue = sale.payments.reduce((sum, payment) => {
        const isGdpPayment =
          payment.method === 'GDP' ||
          (payment.storePaymentMethodId != null &&
            gdpMethodIds.has(payment.storePaymentMethodId));
        return isGdpPayment ? sum + toNumber(payment.amount) : sum;
      }, 0);

      const itemGdpQty = sale.items.reduce((sum, item) => {
        const isGdpItem =
          item.storePaymentMethodId != null &&
          gdpMethodIds.has(item.storePaymentMethodId);
        return isGdpItem && isGlp(item.product.productType) ? sum + item.quantity : sum;
      }, 0);

      const saleIsGdp =
        sale.gasDoPovoBenefit || saleGdpRevenue > 0 || itemGdpQty > 0;
      const saleGdpQty = itemGdpQty > 0 ? itemGdpQty : saleIsGdp ? saleGlpQty : 0;

      gdpQuantity += saleGdpQty;
      gdpRevenue += saleGdpRevenue;
      if (saleIsGdp) gdpSalesCount += 1;

      if (sale.delivererId) {
        const id = sale.delivererId;
        glpQuantityByDelivererId.set(
          id,
          (glpQuantityByDelivererId.get(id) ?? 0) + saleGlpQty,
        );
        gdpQuantityByDelivererId.set(
          id,
          (gdpQuantityByDelivererId.get(id) ?? 0) + saleGdpQty,
        );
        gdpRevenueByDelivererId.set(
          id,
          (gdpRevenueByDelivererId.get(id) ?? 0) + saleGdpRevenue,
        );
      }
    }

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

    const byDeliverer = routeStats.byDeliverer.map((row) => ({
      ...row,
      glpQuantity: glpQuantityByDelivererId.get(row.delivererId) ?? 0,
      gdpQuantity: gdpQuantityByDelivererId.get(row.delivererId) ?? 0,
      gdpRevenue: gdpRevenueByDelivererId.get(row.delivererId) ?? 0,
    }));

    const stockGlp = (() => {
      type Acc = {
        name: string;
        sku: string;
        current: number;
        sinceStartIn: number;
        sinceStartOut: number;
        periodIn: number;
        periodOut: number;
      };
      const byProduct = new Map<string, Acc>();

      for (const balance of glpBalances) {
        const acc = byProduct.get(balance.product.id) ?? {
          name: balance.product.name,
          sku: balance.product.sku,
          current: 0,
          sinceStartIn: 0,
          sinceStartOut: 0,
          periodIn: 0,
          periodOut: 0,
        };
        acc.current += balance.available;
        byProduct.set(balance.product.id, acc);
      }

      for (const movement of glpMovements) {
        const acc = byProduct.get(movement.productId) ?? {
          name: 'GLP',
          sku: '',
          current: 0,
          sinceStartIn: 0,
          sinceStartOut: 0,
          periodIn: 0,
          periodOut: 0,
        };
        const inPeriod = movement.createdAt >= start && movement.createdAt < end;
        if (movement.type === 'IN') {
          acc.sinceStartIn += movement.quantity;
          if (inPeriod) acc.periodIn += movement.quantity;
        } else {
          acc.sinceStartOut += movement.quantity;
          if (inPeriod) acc.periodOut += movement.quantity;
        }
        byProduct.set(movement.productId, acc);
      }

      const products = Array.from(byProduct.entries())
        .map(([productId, acc]) => {
          const opening = acc.current - acc.sinceStartIn + acc.sinceStartOut;
          const out = acc.periodOut;
          const closing = opening + acc.periodIn - acc.periodOut;
          return { productId, name: acc.name, sku: acc.sku, opening, out, closing };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      const totals = products.reduce(
        (sum, p) => ({
          opening: sum.opening + p.opening,
          out: sum.out + p.out,
          closing: sum.closing + p.closing,
        }),
        { opening: 0, out: 0, closing: 0 },
      );

      return { products, totals };
    })();

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
            grossMarginPercent: computeGrossMarginPercent(totalCost, grossProfit),
            totalProcessingFees,
            netRevenue,
            netProfit,
            netMarginPercent: computeNetMarginPercent(totalCost, netProfit),
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
      stockGlp,
      glpQuantitySold,
      gasDoPovo: {
        quantity: gdpQuantity,
        revenue: gdpRevenue,
        salesCount: gdpSalesCount,
      },
      portaria: {
        salesCount: portariaSalesCount,
        glpQuantity: portariaGlpQuantity,
      },
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
        byDeliverer,
      },
    };
  }
}
