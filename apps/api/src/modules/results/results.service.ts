import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  COUNTED_BACKDATE_APPROVALS,
  COUNTED_MOBILE_APPROVALS,
  COUNTED_SALE_STATUSES,
  DashboardDateQuery,
  canViewExpenses,
  computeGrossProfit,
  computeMarginPercent,
  computeNetCost,
  computeNetProfitFromNetCost,
  formatDashboardDateRangeLabel,
  toNumber,
  type StoreResult,
  type StoreResultCategory,
  type StoreResultCategoryRef,
  type StoreResultsResponse,
} from '@gas-erp/shared';
import {
  dateOnlyRangeBounds,
  resolveDashboardDateRange,
} from '../../common/utils/business-day';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resultado por unidade — a análise vertical do DRE.
 *
 * Cada linha vem em reais e em % do faturamento da própria unidade, o que permite
 * comparar lojas de portes diferentes: R$ 7.000 de luz é muito ou pouco depende do
 * faturamento que sustentou esse custo.
 */
@Injectable()
export class ResultsService {
  constructor(private prisma: PrismaService) {}

  async byStore(user: AuthUser, dateQuery: DashboardDateQuery = {}): Promise<StoreResultsResponse> {
    // Mesmo portão do painel de custos: o resultado expõe as despesas da empresa.
    if (!canViewExpenses(user.role)) {
      throw new ForbiddenException('Sem acesso ao resultado por unidade');
    }

    const { start, end, dateFrom, dateTo } = this.resolveRange(dateQuery);

    const isOrgWide = user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN';
    const stores = await this.prisma.store.findMany({
      where: {
        organizationId: user.organizationId,
        active: true,
        ...(isOrgWide ? {} : { id: { in: user.storeIds } }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
    const storeIds = stores.map((store) => store.id);

    if (storeIds.length === 0) {
      return {
        date: formatDashboardDateRangeLabel(dateFrom, dateTo),
        dateFrom,
        dateTo,
        stores: [],
        consolidated: emptyResult('', 'Consolidado', ''),
        categories: [],
      };
    }

    // Mesmo recorte de venda contada do dashboard — sem isso os números das duas
    // telas divergiriam para vendas retroativas ou pendentes de aprovação.
    const saleWhere = {
      storeId: { in: storeIds },
      saleDate: { gte: start, lt: end },
      backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
      mobileApproval: { in: COUNTED_MOBILE_APPROVALS },
      status: { in: [...COUNTED_SALE_STATUSES] as SaleStatus[] },
    };

    const [salesGrouped, saleItems, payments, expenseRows, categories] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['storeId'],
        where: saleWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.saleItem.findMany({
        where: { sale: saleWhere },
        select: { quantity: true, unitCost: true, sale: { select: { storeId: true } } },
      }),
      this.prisma.salePayment.findMany({
        where: { sale: saleWhere },
        select: { processingFee: true, sale: { select: { storeId: true } } },
      }),
      this.prisma.expense.groupBy({
        by: ['storeId', 'categoryId'],
        where: {
          organizationId: user.organizationId,
          storeId: { in: storeIds },
          // Competência, e pendente conta: o gasto do mês pesa no resultado do mês.
          expenseDate: dateOnlyRangeBounds(dateFrom, dateTo),
          status: { not: 'CANCELLED' },
        },
        _sum: { amount: true },
      }),
      this.prisma.expenseCategory.findMany({
        where: { organizationId: user.organizationId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, icon: true, color: true },
      }),
    ]);

    const revenueByStore = new Map<string, number>();
    const salesCountByStore = new Map<string, number>();
    for (const row of salesGrouped) {
      revenueByStore.set(row.storeId, toNumber(row._sum.total));
      salesCountByStore.set(row.storeId, row._count._all);
    }

    const cogsByStore = new Map<string, number>();
    for (const item of saleItems) {
      const storeId = item.sale.storeId;
      const line = item.quantity * toNumber(item.unitCost);
      cogsByStore.set(storeId, (cogsByStore.get(storeId) ?? 0) + line);
    }

    const feesByStore = new Map<string, number>();
    for (const payment of payments) {
      const storeId = payment.sale.storeId;
      feesByStore.set(storeId, (feesByStore.get(storeId) ?? 0) + toNumber(payment.processingFee));
    }

    const expensesByStore = new Map<string, Map<string, number>>();
    for (const row of expenseRows) {
      if (!row.storeId) continue;
      const byCategory = expensesByStore.get(row.storeId) ?? new Map<string, number>();
      byCategory.set(row.categoryId, round2(toNumber(row._sum.amount)));
      expensesByStore.set(row.storeId, byCategory);
    }

    // Só as categorias com lançamento no período viram linha — a tabela mostraria
    // uma dúzia de zeros se listasse o catálogo inteiro.
    const usedCategoryIds = new Set(expenseRows.map((row) => row.categoryId));
    const categoryRefs: StoreResultCategoryRef[] = categories
      .filter((category) => usedCategoryIds.has(category.id))
      .map((category) => ({
        categoryId: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
      }));

    const results = stores.map((store) =>
      buildResult({
        storeId: store.id,
        storeName: store.name,
        storeCode: store.code,
        salesCount: salesCountByStore.get(store.id) ?? 0,
        revenue: round2(revenueByStore.get(store.id) ?? 0),
        cogs: round2(cogsByStore.get(store.id) ?? 0),
        processingFees: round2(feesByStore.get(store.id) ?? 0),
        categoryRefs,
        expensesByCategoryId: expensesByStore.get(store.id) ?? new Map(),
      }),
    );

    const consolidated = buildResult({
      storeId: '',
      storeName: 'Consolidado',
      storeCode: '',
      salesCount: sum(results.map((row) => row.salesCount)),
      revenue: round2(sum(results.map((row) => row.revenue))),
      cogs: round2(sum(results.map((row) => row.cogs))),
      processingFees: round2(sum(results.map((row) => row.processingFees))),
      categoryRefs,
      expensesByCategoryId: new Map(
        categoryRefs.map((category) => [
          category.categoryId,
          round2(
            sum(
              results.map(
                (row) =>
                  row.expensesByCategory.find((item) => item.categoryId === category.categoryId)
                    ?.total ?? 0,
              ),
            ),
          ),
        ]),
      ),
    });

    return {
      date: formatDashboardDateRangeLabel(dateFrom, dateTo),
      dateFrom,
      dateTo,
      stores: results,
      consolidated,
      categories: categoryRefs,
    };
  }

  private resolveRange(dateQuery: DashboardDateQuery) {
    try {
      return resolveDashboardDateRange(dateQuery);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Período inválido');
    }
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function buildResult(input: {
  storeId: string;
  storeName: string;
  storeCode: string;
  salesCount: number;
  revenue: number;
  cogs: number;
  processingFees: number;
  categoryRefs: StoreResultCategoryRef[];
  expensesByCategoryId: Map<string, number>;
}): StoreResult {
  const { revenue, cogs, processingFees } = input;

  const expensesByCategory: StoreResultCategory[] = input.categoryRefs.map((category) => {
    const total = input.expensesByCategoryId.get(category.categoryId) ?? 0;
    return { ...category, total, percent: computeMarginPercent(revenue, total) };
  });

  const expensesTotal = round2(sum(expensesByCategory.map((category) => category.total)));
  const grossProfit = round2(computeGrossProfit(revenue, cogs));
  const netCost = computeNetCost(cogs, processingFees, expensesTotal);
  const netProfit = computeNetProfitFromNetCost(revenue, netCost);

  return {
    storeId: input.storeId,
    storeName: input.storeName,
    storeCode: input.storeCode,
    salesCount: input.salesCount,
    revenue,
    cogs,
    cogsPercent: computeMarginPercent(revenue, cogs),
    grossProfit,
    grossMarginPercent: computeMarginPercent(revenue, grossProfit),
    processingFees,
    processingFeesPercent: computeMarginPercent(revenue, processingFees),
    expensesTotal,
    expensesPercent: computeMarginPercent(revenue, expensesTotal),
    expensesByCategory,
    netProfit,
    netMarginPercent: computeMarginPercent(revenue, netProfit),
  };
}

function emptyResult(storeId: string, storeName: string, storeCode: string): StoreResult {
  return buildResult({
    storeId,
    storeName,
    storeCode,
    salesCount: 0,
    revenue: 0,
    cogs: 0,
    processingFees: 0,
    categoryRefs: [],
    expensesByCategoryId: new Map(),
  });
}
