import { z } from 'zod';

/**
 * Tipos de payload do módulo de Relatórios (read-only, agregação).
 *
 * As datas de período seguem o mesmo contrato do dashboard / resumo diário:
 * `date` (dia único) ou `dateFrom`/`dateTo` (intervalo inclusivo), no fuso
 * operacional `America/Sao_Paulo`. Ver `business-day.ts`.
 */

export const REPORT_TYPES = ['sales', 'purchases', 'stock'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_EXPORT_FORMATS = ['csv'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');

export const reportPeriodQuerySchema = z.object({
  storeId: z.string().min(1, 'storeId é obrigatório'),
  date: dateKey.optional(),
  dateFrom: dateKey.optional(),
  dateTo: dateKey.optional(),
});

export const reportExportQuerySchema = reportPeriodQuerySchema.extend({
  type: z.enum(REPORT_TYPES),
  format: z.enum(REPORT_EXPORT_FORMATS).default('csv'),
});

export const salesReportFiltersSchema = z.object({
  status: z.string().optional(),
  delivererSearch: z.string().optional(),
  customerSearch: z.string().optional(),
  paymentMethod: z.string().optional(),
});

export const salesReportQuerySchema = reportPeriodQuerySchema.merge(salesReportFiltersSchema);

export const salesExportQuerySchema = reportExportQuerySchema.merge(salesReportFiltersSchema);

export type ReportPeriodQuery = z.infer<typeof reportPeriodQuerySchema>;
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
export type SalesReportFilters = z.infer<typeof salesReportFiltersSchema>;

/** Bloco comum de período presente em todas as respostas de relatório. */
export interface ReportPeriod {
  /** Rótulo legível do período (ex.: "26/06/2026" ou "01/06/2026 – 26/06/2026"). */
  date: string;
  dateFrom: string;
  dateTo: string;
}

/* ----------------------------- Vendas ----------------------------- */

export interface SalesReportByStatus {
  status: string;
  label: string;
  count: number;
  total: number;
}

export interface SalesReportByDay {
  date: string;
  count: number;
  total: number;
}

export interface SalesReportByPaymentMethod {
  method: string;
  label: string;
  total: number;
}

export interface SalesReportByDeliverer {
  delivererId: string;
  delivererName: string;
  deliveryCount: number;
  avgWaitTimeSeconds: number | null;
  avgRouteDurationSeconds: number | null;
}

/** Uma linha do relatório detalhado de vendas (formato planilha). */
export interface SalesReportRow {
  saleId: string;
  saleDate: string;
  createdAt: string;
  status: string;
  statusLabel: string;
  channel: string;
  channelLabel: string;
  customerName: string | null;
  customerPhone: string | null;
  attendantName: string | null;
  delivererName: string | null;
  deliveryAddress: string | null;
  itemsSummary: string;
  deliveryFee: number;
  gasDoPovoBenefit: boolean;
  paymentSummary: string;
  paymentDetails: string;
  total: number;
  deliveryStatus: string | null;
  deliveryStatusLabel: string | null;
  waitTimeSeconds: number | null;
  waitTimeLabel: string | null;
  routeDurationSeconds: number | null;
  routeDurationLabel: string | null;
  notes: string | null;
}

export interface SalesReportResponse extends ReportPeriod {
  totalRevenue: number;
  salesCount: number;
  averageTicket: number;
  byStatus: SalesReportByStatus[];
  byDay: SalesReportByDay[];
  byPaymentMethod: SalesReportByPaymentMethod[];
  byDeliverer: SalesReportByDeliverer[];
  rows: SalesReportRow[];
}

/* ----------------------------- Compras ----------------------------- */

export interface PurchasesReportBySupplier {
  supplierId: string;
  supplierName: string;
  document: string | null;
  invoiceCount: number;
  total: number;
}

export interface PurchasesReportByProduct {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  total: number;
}

export interface PurchasesReportPayableByCategory {
  category: string;
  count: number;
  amount: number;
}

export interface PurchasesReportResponse extends ReportPeriod {
  totalPurchases: number;
  invoiceCount: number;
  bySupplier: PurchasesReportBySupplier[];
  byProduct: PurchasesReportByProduct[];
  /** Contas a pagar derivadas de PurchaseInvoicePayment (vencimentos no período). */
  payablesTotal: number;
  payablesByCategory: PurchasesReportPayableByCategory[];
}

/* ----------------------------- Estoque ----------------------------- */

export interface StockReportBalance {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  available: number;
  inTransit: number;
  lent: number;
}

export interface StockReportMovementByProduct {
  productId: string;
  productName: string;
  sku: string;
  in: number;
  out: number;
  net: number;
}

export interface StockReportResponse extends ReportPeriod {
  balances: StockReportBalance[];
  totalAvailable: number;
  totalIn: number;
  totalOut: number;
  movementsByProduct: StockReportMovementByProduct[];
}
