import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma, SaleStatus, PurchaseInvoiceStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  aggregateDelivererRouteStats,
  AuthUser,
  COUNTED_BACKDATE_APPROVALS,
  COUNTED_MOBILE_APPROVALS,
  COUNTED_SALE_STATUSES,
  DashboardDateQuery,
  DELIVERY_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SALE_CHANNEL_LABELS,
  SALE_STATUS_LABELS,
  formatDashboardDateRangeLabel,
  formatDateKeyInTimezone,
  formatWaitTime,
  getRouteDurationSeconds,
  getSaleAttendantName,
  getSaleDelivererName,
  getSaleDisplayStatus,
  getWaitTimeSeconds,
  getTotalDeliveryTimeSeconds,
  toNumber,
  canViewFinancialMargins,
  computeGrossMarginPercent,
  computeGrossProfit,
  computeNetMarginPercent,
  computeNetProfit,
  computeNetRevenue,
  computeSaleCogs,
  phoneSearchTerms,
  type PurchasesReportResponse,
  type ReportType,
  type SalesReportFilters,
  type SalesReportResponse,
  type SalesReportRow,
  type StockReportResponse,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { resolveDashboardDateRange } from '../../common/utils/business-day';

const salesReportInclude = {
  store: { select: { id: true, name: true } },
  customer: { select: { name: true, phone: true } },
  attendant: { select: { name: true } },
  deliverer: { include: { user: { select: { name: true } } } },
  createdByDeliverer: { include: { user: { select: { name: true } } } },
  items: { include: { product: { select: { name: true } } } },
  payments: { include: { storePaymentMethod: { select: { label: true } } } },
  delivery: true,
} satisfies Prisma.SaleInclude;

type SaleForReport = Prisma.SaleGetPayload<{ include: typeof salesReportInclude }>;

function buildDeliveryAddress(sale: {
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryComplement: string | null;
  deliveryNeighborhood: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryLandmark: string | null;
}): string | null {
  const parts: string[] = [];
  const streetLine = [sale.deliveryStreet, sale.deliveryNumber].filter(Boolean).join(', ');
  if (streetLine) parts.push(streetLine);
  if (sale.deliveryComplement) parts.push(sale.deliveryComplement);
  if (sale.deliveryNeighborhood) parts.push(sale.deliveryNeighborhood);
  const cityLine = [sale.deliveryCity, sale.deliveryState].filter(Boolean).join(' - ');
  if (cityLine) parts.push(cityLine);
  if (sale.deliveryLandmark) parts.push(`Ref.: ${sale.deliveryLandmark}`);
  return parts.length ? parts.join(', ') : null;
}

function formatReportDateTime(iso: Date | string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function paymentDisplayLabel(payment: {
  method: string;
  storePaymentMethod?: { label: string } | null;
}): string {
  return payment.storePaymentMethod?.label ?? PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
}

function mapSaleToReportRow(sale: SaleForReport, showFinancial: boolean): SalesReportRow {
  const delivery = sale.delivery;
  const waitTimeSeconds = delivery
    ? getWaitTimeSeconds(sale.createdAt, delivery.startedAt)
    : null;
  const routeDurationSeconds = delivery
    ? getRouteDurationSeconds(delivery.startedAt, delivery.completedAt)
    : null;
  const totalDeliveryTimeSeconds = getTotalDeliveryTimeSeconds(
    waitTimeSeconds,
    routeDurationSeconds,
  );
  const displayStatus = getSaleDisplayStatus(sale);
  const paymentSummary = [...new Set(sale.payments.map((p) => paymentDisplayLabel(p)))].join(', ');
  const paymentDetails = sale.payments
    .map((p) => `${paymentDisplayLabel(p)}: ${formatCsvMoney(toNumber(p.amount))}`)
    .join('; ');
  const itemsSummary = sale.items
    .map((item) => `${item.quantity}x ${item.product.name}`)
    .join('; ');
  const total = toNumber(sale.total);
  const totalCost = computeSaleCogs(sale.items);
  const grossProfit = computeGrossProfit(total, totalCost);
  const totalProcessingFees = sale.payments.reduce(
    (sum, payment) => sum + toNumber(payment.processingFee),
    0,
  );
  const netRevenue = computeNetRevenue(total, totalProcessingFees);
  const netProfit = computeNetProfit(grossProfit, totalProcessingFees);

  return {
    saleId: sale.id,
    storeId: sale.storeId,
    storeName: sale.store?.name ?? undefined,
    saleDate: formatDateKeyInTimezone(sale.saleDate),
    createdAt: formatReportDateTime(sale.createdAt),
    status: sale.status,
    statusLabel: displayStatus.label,
    channel: sale.channel,
    channelLabel: SALE_CHANNEL_LABELS[sale.channel] ?? sale.channel,
    customerName: sale.customer?.name ?? null,
    customerPhone: sale.customer?.phone ?? null,
    attendantName: getSaleAttendantName(sale),
    delivererName: getSaleDelivererName(sale),
    deliveryAddress: buildDeliveryAddress(sale),
    itemsSummary,
    deliveryFee: toNumber(sale.deliveryFee),
    gasDoPovoBenefit: sale.gasDoPovoBenefit,
    paymentSummary,
    paymentDetails,
    total,
    ...(showFinancial
      ? {
          totalCost,
          grossProfit,
          grossMarginPercent: computeGrossMarginPercent(totalCost, grossProfit),
          totalProcessingFees,
          netRevenue,
          netProfit,
          netMarginPercent: computeNetMarginPercent(totalCost, netProfit),
        }
      : {}),
    deliveryStatus: delivery?.status ?? null,
    deliveryStatusLabel: delivery ? (DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status) : null,
    waitTimeSeconds,
    waitTimeLabel: formatWaitTime(waitTimeSeconds),
    routeDurationSeconds,
    routeDurationLabel: formatWaitTime(routeDurationSeconds),
    totalDeliveryTimeSeconds,
    totalDeliveryTimeLabel: formatWaitTime(totalDeliveryTimeSeconds),
    notes: sale.notes,
  };
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private resolveRange(dateQuery: DashboardDateQuery) {
    try {
      return resolveDashboardDateRange(dateQuery);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Período inválido',
      );
    }
  }

  /* ------------------------------- Vendas ------------------------------- */

  async salesReport(
    user: AuthUser,
    storeId: string | undefined,
    dateQuery: DashboardDateQuery = {},
    filters: SalesReportFilters = {},
  ): Promise<SalesReportResponse> {
    const storeFilter = await this.resolveSalesStoreFilter(user, storeId);
    const { start, end, dateFrom, dateTo } = this.resolveRange(dateQuery);

    const countedSaleWhere = this.buildSalesReportWhere(storeFilter, start, end, filters);

    const [statusGroups, dayGroups, paymentRows, deliveries, sales] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['status'],
        where: countedSaleWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.sale.groupBy({
        by: ['saleDate'],
        where: countedSaleWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.salePayment.findMany({
        where: { sale: countedSaleWhere },
        select: {
          method: true,
          amount: true,
          processingFee: true,
          storePaymentMethod: { select: { label: true, systemCode: true } },
        },
      }),
      this.prisma.delivery.findMany({
        where: {
          sale: {
            storeId: storeFilter,
            saleDate: { gte: start, lt: end },
            backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
            mobileApproval: { in: COUNTED_MOBILE_APPROVALS },
          },
        },
        include: {
          sale: { select: { createdAt: true } },
          deliverer: { include: { user: { select: { name: true } } } },
        },
      }),
      this.prisma.sale.findMany({
        where: countedSaleWhere,
        include: salesReportInclude,
        orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const byStatus = statusGroups
      .map((group) => ({
        status: group.status,
        label: SALE_STATUS_LABELS[group.status] ?? group.status,
        count: group._count._all,
        total: toNumber(group._sum.total),
      }))
      .sort((a, b) => b.total - a.total);

    // Totais refletem apenas vendas efetivadas (DELIVERED/PORTARIA), salvo filtro explícito de status.
    const totalRevenue = byStatus.reduce((sum, s) => sum + s.total, 0);
    const salesCount = byStatus.reduce((sum, s) => sum + s.count, 0);
    const averageTicket = salesCount > 0 ? totalRevenue / salesCount : 0;

    // Por dia: cada saleDate é normalizada para meio-dia local do dia operacional,
    // então mapear para a chave de data agrega corretamente por dia.
    const byDayMap = new Map<string, { count: number; total: number }>();
    for (const group of dayGroups) {
      const key = formatDateKeyInTimezone(group.saleDate);
      const acc = byDayMap.get(key) ?? { count: 0, total: 0 };
      acc.count += group._count._all;
      acc.total += toNumber(group._sum.total);
      byDayMap.set(key, acc);
    }
    const byDay = Array.from(byDayMap.entries())
      .map(([date, value]) => ({ date, count: value.count, total: value.total }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const showFinancial = canViewFinancialMargins(user.role);

    type PaymentAgg = {
      method: string;
      label: string;
      total: number;
      processingFees: number;
      totalCost: number;
    };
    const paymentAggByLabel = new Map<string, PaymentAgg>();
    for (const payment of paymentRows) {
      const label = paymentDisplayLabel(payment);
      const method = payment.storePaymentMethod?.systemCode ?? payment.method;
      const acc = paymentAggByLabel.get(label) ?? {
        method,
        label,
        total: 0,
        processingFees: 0,
        totalCost: 0,
      };
      acc.total += toNumber(payment.amount);
      acc.processingFees += toNumber(payment.processingFee);
      paymentAggByLabel.set(label, acc);
    }

    if (showFinancial) {
      for (const sale of sales) {
        const saleTotal = toNumber(sale.total);
        const cogs = computeSaleCogs(sale.items);
        for (const payment of sale.payments) {
          const label = paymentDisplayLabel(payment);
          const acc = paymentAggByLabel.get(label);
          if (!acc) continue;
          const amount = toNumber(payment.amount);
          acc.totalCost += saleTotal > 0 ? (amount / saleTotal) * cogs : 0;
        }
      }
    }

    const byPaymentMethod = Array.from(paymentAggByLabel.values())
      .map((entry) => {
        const grossProfit = showFinancial
          ? computeGrossProfit(entry.total, entry.totalCost)
          : undefined;
        const netRevenue = computeNetRevenue(entry.total, entry.processingFees);
        const netProfit =
          grossProfit != null ? computeNetProfit(grossProfit, entry.processingFees) : undefined;
        return {
          method: entry.method,
          label: entry.label,
          total: entry.total,
          ...(showFinancial
            ? {
                processingFees: entry.processingFees,
                netRevenue,
                grossProfit,
                netProfit,
              }
            : {}),
        };
      })
      .sort((a, b) => b.total - a.total);

    const routeStats = aggregateDelivererRouteStats(
      deliveries
        .filter((delivery) => delivery.delivererId && delivery.deliverer)
        .map((delivery) => ({
          status: delivery.status,
          delivererId: delivery.delivererId!,
          delivererName: delivery.deliverer!.user.name,
          saleId: delivery.saleId,
          saleCreatedAt: delivery.sale.createdAt,
          startedAt: delivery.startedAt,
          completedAt: delivery.completedAt,
        })),
    );
    const byDeliverer = routeStats.byDeliverer;

    let rows = sales.map((sale) => mapSaleToReportRow(sale, showFinancial));

    const financialSummary = showFinancial
      ? (() => {
          const totalCost = sales.reduce(
            (sum, sale) => sum + computeSaleCogs(sale.items),
            0,
          );
          const grossProfit = computeGrossProfit(totalRevenue, totalCost);
          const totalProcessingFees = sales.reduce(
            (sum, sale) =>
              sum +
              sale.payments.reduce((feeSum, payment) => feeSum + toNumber(payment.processingFee), 0),
            0,
          );
          const netRevenue = computeNetRevenue(totalRevenue, totalProcessingFees);
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

    if (!showFinancial) {
      rows = rows.map(
        ({
          totalCost: _c,
          grossProfit: _p,
          grossMarginPercent: _m,
          totalProcessingFees: _f,
          netRevenue: _nr,
          netProfit: _np,
          netMarginPercent: _nm,
          ...row
        }) => row,
      );
    }

    return {
      date: formatDashboardDateRangeLabel(dateFrom, dateTo),
      dateFrom,
      dateTo,
      totalRevenue,
      salesCount,
      averageTicket,
      ...financialSummary,
      byStatus,
      byDay,
      byPaymentMethod,
      byDeliverer,
      rows,
    };
  }

  /**
   * Resolve o filtro de loja do relatório de vendas.
   * - Com `storeId`: valida acesso e restringe àquela loja.
   * - Sem `storeId`: apenas ORG_MASTER/PLATFORM_ADMIN; agrega todas as lojas
   *   ativas da organização (relatório consolidado do master).
   */
  private async resolveSalesStoreFilter(
    user: AuthUser,
    storeId: string | undefined,
  ): Promise<Prisma.SaleWhereInput['storeId']> {
    if (storeId) {
      assertStoreAccess(user, storeId);
      return storeId;
    }
    if (user.role !== 'ORG_MASTER' && user.role !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException('Apenas o master pode ver o relatório consolidado.');
    }
    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId, active: true },
      select: { id: true },
    });
    return { in: stores.map((store) => store.id) };
  }

  private buildSalesReportWhere(
    storeFilter: Prisma.SaleWhereInput['storeId'],
    start: Date,
    end: Date,
    filters: SalesReportFilters,
  ): Prisma.SaleWhereInput {
    const where: Prisma.SaleWhereInput = {
      storeId: storeFilter,
      saleDate: { gte: start, lt: end },
      backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
      mobileApproval: { in: COUNTED_MOBILE_APPROVALS },
      status: filters.status
        ? (filters.status as SaleStatus)
        : { in: [...COUNTED_SALE_STATUSES] as SaleStatus[] },
    };
    if (filters.paymentMethod) {
      where.payments = {
        some: {
          OR: [
            { method: filters.paymentMethod as PaymentMethod },
            { storePaymentMethod: { systemCode: filters.paymentMethod } },
          ],
        },
      };
    }
    if (filters.customerSearch?.trim()) {
      const term = filters.customerSearch.trim();
      where.customer = {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          ...phoneSearchTerms(term).map((phoneTerm) => ({
            phone: { contains: phoneTerm, mode: 'insensitive' as const },
          })),
        ],
      };
    }
    if (filters.delivererId) {
      where.delivererId = filters.delivererId;
    } else if (filters.delivererSearch?.trim()) {
      const term = filters.delivererSearch.trim();
      where.deliverer = { user: { name: { contains: term, mode: 'insensitive' } } };
    }

    return where;
  }

  /* ------------------------------ Compras ------------------------------ */

  async purchasesReport(
    user: AuthUser,
    storeId: string,
    dateQuery: DashboardDateQuery = {},
  ): Promise<PurchasesReportResponse> {
    assertStoreAccess(user, storeId);
    const { start, end, dateFrom, dateTo } = this.resolveRange(dateQuery);

    const invoiceWhere = {
      storeId,
      issueDate: { gte: start, lt: end },
      status: { not: PurchaseInvoiceStatus.CANCELLED },
    };

    const [supplierGroups, itemGroups, paymentGroups, invoiceAgg] = await Promise.all([
      this.prisma.purchaseInvoice.groupBy({
        by: ['supplierId'],
        where: invoiceWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.purchaseInvoiceItem.groupBy({
        by: ['productId'],
        where: { invoice: invoiceWhere },
        _sum: { quantity: true, total: true },
      }),
      // Contas a pagar: vencimentos no período (por dueDate), por categoria.
      this.prisma.purchaseInvoicePayment.groupBy({
        by: ['category'],
        where: {
          dueDate: { gte: start, lt: end },
          invoice: { storeId, status: { not: PurchaseInvoiceStatus.CANCELLED } },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.purchaseInvoice.aggregate({
        where: invoiceWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);

    const supplierIds = supplierGroups.map((g) => g.supplierId);
    const suppliers = supplierIds.length
      ? await this.prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, legalName: true, tradeName: true, document: true },
        })
      : [];
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const bySupplier = supplierGroups
      .map((group) => {
        const supplier = supplierById.get(group.supplierId);
        return {
          supplierId: group.supplierId,
          supplierName: supplier?.tradeName || supplier?.legalName || 'Fornecedor',
          document: supplier?.document ?? null,
          invoiceCount: group._count._all,
          total: toNumber(group._sum.total),
        };
      })
      .sort((a, b) => b.total - a.total);

    const productIds = itemGroups.map((g) => g.productId);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true },
        })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));
    const byProduct = itemGroups
      .map((group) => {
        const product = productById.get(group.productId);
        return {
          productId: group.productId,
          productName: product?.name ?? 'Produto',
          sku: product?.sku ?? '',
          quantity: group._sum.quantity ?? 0,
          total: toNumber(group._sum.total),
        };
      })
      .sort((a, b) => b.total - a.total);

    const payablesByCategory = paymentGroups
      .map((group) => ({
        category: group.category,
        count: group._count._all,
        amount: toNumber(group._sum.amount),
      }))
      .sort((a, b) => b.amount - a.amount);
    const payablesTotal = payablesByCategory.reduce((sum, p) => sum + p.amount, 0);

    return {
      date: formatDashboardDateRangeLabel(dateFrom, dateTo),
      dateFrom,
      dateTo,
      totalPurchases: toNumber(invoiceAgg._sum.total),
      invoiceCount: invoiceAgg._count._all,
      bySupplier,
      byProduct,
      payablesTotal,
      payablesByCategory,
    };
  }

  /* ------------------------------ Estoque ------------------------------ */

  async stockReport(
    user: AuthUser,
    storeId: string,
    dateQuery: DashboardDateQuery = {},
  ): Promise<StockReportResponse> {
    assertStoreAccess(user, storeId);
    const { start, end, dateFrom, dateTo } = this.resolveRange(dateQuery);

    const [balanceRows, movements] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where: { storeId, product: { organizationId: user.organizationId } },
        include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
        orderBy: { product: { name: 'asc' } },
      }),
      this.prisma.stockMovement.findMany({
        where: { storeId, createdAt: { gte: start, lt: end } },
        select: { productId: true, type: true, quantity: true },
      }),
    ]);

    const balances = balanceRows.map((b) => ({
      productId: b.product.id,
      productName: b.product.name,
      sku: b.product.sku,
      unit: b.product.unit,
      available: b.available,
      inTransit: b.inTransit,
      lent: b.lent,
    }));
    const totalAvailable = balances.reduce((sum, b) => sum + b.available, 0);

    const movementMap = new Map<string, { in: number; out: number }>();
    let totalIn = 0;
    let totalOut = 0;
    for (const movement of movements) {
      const acc = movementMap.get(movement.productId) ?? { in: 0, out: 0 };
      if (movement.type === 'IN') {
        acc.in += movement.quantity;
        totalIn += movement.quantity;
      } else {
        acc.out += movement.quantity;
        totalOut += movement.quantity;
      }
      movementMap.set(movement.productId, acc);
    }

    const productIds = [...movementMap.keys()];
    const movementProducts = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true },
        })
      : [];
    const productById = new Map(movementProducts.map((p) => [p.id, p]));
    const movementsByProduct = productIds
      .map((productId) => {
        const value = movementMap.get(productId)!;
        const product = productById.get(productId);
        return {
          productId,
          productName: product?.name ?? 'Produto',
          sku: product?.sku ?? '',
          in: value.in,
          out: value.out,
          net: value.in - value.out,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR'));

    return {
      date: formatDashboardDateRangeLabel(dateFrom, dateTo),
      dateFrom,
      dateTo,
      balances,
      totalAvailable,
      totalIn,
      totalOut,
      movementsByProduct,
    };
  }

  /* ------------------------------- Export ------------------------------- */

  async exportCsv(
    user: AuthUser,
    type: ReportType,
    storeId: string | undefined,
    dateQuery: DashboardDateQuery = {},
    salesFilters: SalesReportFilters = {},
  ): Promise<{ filename: string; csv: string }> {
    if (type === 'sales') {
      const report = await this.salesReport(user, storeId, dateQuery, salesFilters);
      const showFinancial = canViewFinancialMargins(user.role);
      // Coluna Unidade só no relatório consolidado (sem loja específica).
      const showStore = !storeId;
      const headers = [
        'Data da venda',
        'Criado em',
        'ID venda',
        ...(showStore ? ['Unidade'] : []),
        'Status',
        'Canal',
        'Cliente',
        'Telefone cliente',
        'Atendente',
        'Entregador',
        'Endereço entrega',
        'Itens',
        'Taxa entrega',
        'Gás do Povo',
        'Formas de pagamento',
        'Detalhe pagamentos',
        'Total',
        ...(showFinancial
          ? [
              'CMV',
              'Lucro bruto',
              'Margem bruta %',
              'Taxas pagamento',
              'Faturamento líquido',
              'Lucro líquido',
              'Margem líquida %',
            ]
          : []),
        'Status entrega',
        'Tempo até aceitar',
        'Tempo em rota',
        'Tempo total da entrega',
        'Observações',
      ];
      const rows = report.rows.map((r) => [
        formatDateKey(r.saleDate),
        r.createdAt,
        r.saleId,
        ...(showStore ? [r.storeName ?? ''] : []),
        r.statusLabel,
        r.channelLabel,
        r.customerName ?? '',
        r.customerPhone ?? '',
        r.attendantName ?? '',
        r.delivererName ?? '',
        r.deliveryAddress ?? '',
        r.itemsSummary,
        formatCsvMoney(r.deliveryFee),
        r.gasDoPovoBenefit ? 'Sim' : 'Não',
        r.paymentSummary,
        r.paymentDetails,
        formatCsvMoney(r.total),
        ...(showFinancial
          ? [
              formatCsvMoney(r.totalCost ?? 0),
              formatCsvMoney(r.grossProfit ?? 0),
              r.grossMarginPercent != null ? `${r.grossMarginPercent}%` : '',
              formatCsvMoney(r.totalProcessingFees ?? 0),
              formatCsvMoney(r.netRevenue ?? 0),
              formatCsvMoney(r.netProfit ?? 0),
              r.netMarginPercent != null ? `${r.netMarginPercent}%` : '',
            ]
          : []),
        r.deliveryStatusLabel ?? '',
        r.waitTimeLabel ?? '',
        r.routeDurationLabel ?? '',
        r.totalDeliveryTimeLabel ?? '',
        r.notes ?? '',
      ]);
      return {
        filename: buildFilename('vendas', report.dateFrom, report.dateTo),
        csv: toCsv(headers, rows),
      };
    }

    if (!storeId) {
      throw new BadRequestException('storeId é obrigatório para este relatório.');
    }

    if (type === 'purchases') {
      const report = await this.purchasesReport(user, storeId, dateQuery);
      const rows = report.bySupplier.map((s) => [
        s.supplierName,
        s.document ?? '',
        s.invoiceCount,
        formatCsvMoney(s.total),
      ]);
      return {
        filename: buildFilename('compras', report.dateFrom, report.dateTo),
        csv: toCsv(['Fornecedor', 'Documento', 'Notas', 'Total'], rows),
      };
    }

    const report = await this.stockReport(user, storeId, dateQuery);
    const rows = report.balances.map((b) => [
      b.sku,
      b.productName,
      b.unit,
      b.available,
      b.inTransit,
      b.lent,
    ]);
    return {
      filename: buildFilename('estoque', report.dateFrom, report.dateTo),
      csv: toCsv(
        ['SKU', 'Produto', 'Unidade', 'Disponível', 'Em trânsito', 'Comodato'],
        rows,
      ),
    };
  }
}

/* ----------------------------- CSV helpers ----------------------------- */

/** Escapa um valor para CSV com separador ";" (padrão Excel pt-BR). */
function csvCell(value: string | number): string {
  const text = String(value ?? '');
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Gera CSV nativo (sem libs) com BOM UTF-8 e separador ";". */
function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Valor monetário com vírgula decimal (sem símbolo), p/ Excel pt-BR. */
function formatCsvMoney(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

function formatDateKey(dateKey: string): string {
  return dateKey.split('-').reverse().join('/');
}

function buildFilename(prefix: string, dateFrom: string, dateTo: string): string {
  const range = dateFrom === dateTo ? dateFrom : `${dateFrom}_a_${dateTo}`;
  return `relatorio-${prefix}-${range}.csv`;
}
