import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus, PurchaseInvoiceStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  COUNTED_BACKDATE_APPROVALS,
  DashboardDateQuery,
  PAYMENT_METHOD_LABELS,
  SALE_STATUS_LABELS,
  formatDashboardDateRangeLabel,
  formatDateKeyInTimezone,
  getRouteDurationSeconds,
  getWaitTimeSeconds,
  resolveDashboardDateRange,
  toNumber,
  type PurchasesReportResponse,
  type ReportType,
  type SalesReportResponse,
  type StockReportResponse,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';

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
    storeId: string,
    dateQuery: DashboardDateQuery = {},
  ): Promise<SalesReportResponse> {
    assertStoreAccess(user, storeId);
    const { start, end, dateFrom, dateTo } = this.resolveRange(dateQuery);

    // Vendas contabilizadas: exclui retroativas PENDING/REJECTED (igual ao dashboard).
    const countedSaleWhere = {
      storeId,
      saleDate: { gte: start, lt: end },
      backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
    };

    const [statusGroups, dayGroups, paymentGroups, deliveries] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['status'],
        where: countedSaleWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.sale.groupBy({
        by: ['saleDate'],
        where: { ...countedSaleWhere, status: { not: SaleStatus.CANCELLED } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.salePayment.groupBy({
        by: ['method'],
        where: { sale: { ...countedSaleWhere, status: { not: SaleStatus.CANCELLED } } },
        _sum: { amount: true },
      }),
      this.prisma.delivery.findMany({
        where: {
          sale: {
            storeId,
            saleDate: { gte: start, lt: end },
            backdateApproval: { in: COUNTED_BACKDATE_APPROVALS },
          },
        },
        include: {
          sale: { select: { createdAt: true } },
          deliverer: { include: { user: { select: { name: true } } } },
        },
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

    // Totais (faturamento / ticket) excluem vendas canceladas.
    const nonCancelled = byStatus.filter((s) => s.status !== SaleStatus.CANCELLED);
    const totalRevenue = nonCancelled.reduce((sum, s) => sum + s.total, 0);
    const salesCount = nonCancelled.reduce((sum, s) => sum + s.count, 0);
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

    const byPaymentMethod = paymentGroups
      .map((group) => ({
        method: group.method,
        label: PAYMENT_METHOD_LABELS[group.method] ?? group.method,
        total: toNumber(group._sum.amount),
      }))
      .sort((a, b) => b.total - a.total);

    const delivererStats = new Map<
      string,
      { delivererName: string; deliveryCount: number; waitTimes: number[]; routeTimes: number[] }
    >();
    for (const delivery of deliveries) {
      const delivererName = delivery.deliverer.user.name;
      const stats = delivererStats.get(delivery.delivererId) ?? {
        delivererName,
        deliveryCount: 0,
        waitTimes: [],
        routeTimes: [],
      };
      stats.deliveryCount += 1;
      const waitTimeSeconds = getWaitTimeSeconds(delivery.sale.createdAt, delivery.startedAt);
      const routeDurationSeconds = getRouteDurationSeconds(delivery.startedAt, delivery.completedAt);
      if (waitTimeSeconds != null) stats.waitTimes.push(waitTimeSeconds);
      if (routeDurationSeconds != null) stats.routeTimes.push(routeDurationSeconds);
      delivererStats.set(delivery.delivererId, stats);
    }
    const avg = (values: number[]) =>
      values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
    const byDeliverer = Array.from(delivererStats.entries())
      .map(([delivererId, stats]) => ({
        delivererId,
        delivererName: stats.delivererName,
        deliveryCount: stats.deliveryCount,
        avgWaitTimeSeconds: avg(stats.waitTimes),
        avgRouteDurationSeconds: avg(stats.routeTimes),
      }))
      .sort((a, b) => b.deliveryCount - a.deliveryCount);

    return {
      date: formatDashboardDateRangeLabel(dateFrom, dateTo),
      dateFrom,
      dateTo,
      totalRevenue,
      salesCount,
      averageTicket,
      byStatus,
      byDay,
      byPaymentMethod,
      byDeliverer,
    };
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
    storeId: string,
    dateQuery: DashboardDateQuery = {},
  ): Promise<{ filename: string; csv: string }> {
    if (type === 'sales') {
      const report = await this.salesReport(user, storeId, dateQuery);
      const rows = report.byDay.map((d) => [
        formatDateKey(d.date),
        d.count,
        formatCsvMoney(d.total),
      ]);
      return {
        filename: buildFilename('vendas', report.dateFrom, report.dateTo),
        csv: toCsv(['Data', 'Vendas', 'Faturamento'], rows),
      };
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
