'use client';

import { Card, Table } from '@/components/ui';
import { PaginatedList } from '@/components/paginated-list';
import { formatCurrency } from '@/lib/utils';
import { formatWaitTime } from '@gas-erp/shared';

export interface DailySummaryData {
  date: string;
  dateFrom?: string;
  dateTo?: string;
  revenue: number;
  totalCost?: number;
  grossProfit?: number;
  grossMarginPercent?: number | null;
  totalProcessingFees?: number;
  netRevenue?: number;
  netProfit?: number;
  netMarginPercent?: number | null;
  salesCount: number;
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
  deliveries: { pending: number; inProgress: number; completed: number; cancelled: number };
  deliveryMetrics?: {
    avgWaitTimeSeconds: number | null;
    maxWaitTimeSeconds: number | null;
    avgRouteDurationSeconds: number | null;
    maxRouteDurationSeconds: number | null;
    avgTotalDeliveryTimeSeconds: number | null;
    maxTotalDeliveryTimeSeconds: number | null;
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
}

interface DailySummaryContentProps {
  data: DailySummaryData;
  showStoreInSlowDeliveries?: boolean;
}

export function DailySummaryContent({ data, showStoreInSlowDeliveries }: DailySummaryContentProps) {
  const metrics = data.deliveryMetrics;
  const isRange = Boolean(data.dateFrom && data.dateTo && data.dateFrom !== data.dateTo);
  const periodLabel = isRange ? 'no período' : 'hoje';
  const showStoreColumn =
    showStoreInSlowDeliveries ??
    (metrics?.slowDeliveries.some((d) => d.storeName) ?? false);
  const paymentEntries = data.paymentsByMethod;
  const showFinancial = data.totalCost != null && data.grossProfit != null;
  const showNetFinancial = showFinancial && data.netRevenue != null && data.netProfit != null;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card><div className="text-sm text-slate-500">Faturamento {periodLabel}</div><div className="text-2xl font-bold">{formatCurrency(data.revenue)}</div></Card>
        {showFinancial && (
          <>
            <Card><div className="text-sm text-slate-500">CMV {periodLabel}</div><div className="text-2xl font-bold">{formatCurrency(data.totalCost!)}</div></Card>
            <Card><div className="text-sm text-slate-500">Lucro bruto {periodLabel}</div><div className="text-2xl font-bold">{formatCurrency(data.grossProfit!)}</div></Card>
            <Card><div className="text-sm text-slate-500">Margem bruta {periodLabel}</div><div className="text-2xl font-bold">{data.grossMarginPercent != null ? `${data.grossMarginPercent}%` : '—'}</div></Card>
          </>
        )}
        {showNetFinancial && (
          <>
            <Card><div className="text-sm text-slate-500">Taxas pagamento {periodLabel}</div><div className="text-2xl font-bold">{formatCurrency(data.totalProcessingFees ?? 0)}</div></Card>
            <Card><div className="text-sm text-slate-500">Faturamento líquido {periodLabel}</div><div className="text-2xl font-bold">{formatCurrency(data.netRevenue!)}</div></Card>
            <Card><div className="text-sm text-slate-500">Lucro líquido {periodLabel}</div><div className="text-2xl font-bold">{formatCurrency(data.netProfit!)}</div></Card>
            <Card><div className="text-sm text-slate-500">Margem líquida {periodLabel}</div><div className="text-2xl font-bold">{data.netMarginPercent != null ? `${data.netMarginPercent}%` : '—'}</div></Card>
          </>
        )}
        <Card><div className="text-sm text-slate-500">Vendas</div><div className="text-2xl font-bold">{data.salesCount}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas pendentes</div><div className="text-2xl font-bold">{data.deliveries.pending}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas em rota</div><div className="text-2xl font-bold">{data.deliveries.inProgress}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas concluídas</div><div className="text-2xl font-bold">{data.deliveries.completed}</div></Card>
        <Card><div className="text-sm text-slate-500">Rotas canceladas</div><div className="text-2xl font-bold">{data.deliveries.cancelled}</div></Card>
        <Card><div className="text-sm text-slate-500">Tempo médio até aceitar</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.avgWaitTimeSeconds)}</div></Card>
        <Card><div className="text-sm text-slate-500">Maior tempo até aceitar</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.maxWaitTimeSeconds)}</div></Card>
        <Card><div className="text-sm text-slate-500">Tempo médio em rota</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.avgRouteDurationSeconds)}</div></Card>
        <Card><div className="text-sm text-slate-500">Maior tempo em rota</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.maxRouteDurationSeconds)}</div></Card>
        <Card><div className="text-sm text-slate-500">Tempo médio total da entrega</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.avgTotalDeliveryTimeSeconds)}</div></Card>
        <Card><div className="text-sm text-slate-500">Maior tempo total da entrega</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.maxTotalDeliveryTimeSeconds)}</div></Card>
      </div>

      {metrics?.slowDeliveries && metrics.slowDeliveries.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">Entregas com tempo elevado</h2>
          <PaginatedList items={metrics.slowDeliveries}>
            {(rows) => (
              <Table>
                <thead className="bg-slate-50 text-left">
                  <tr>
                    {showStoreColumn && <th className="p-3">Unidade</th>}
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Entregador</th>
                    <th className="p-3">Tempo até aceitar</th>
                    <th className="p-3">Tempo em rota</th>
                    <th className="p-3">Tempo total da entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.saleId} className="border-t border-slate-100">
                      {showStoreColumn && <td className="p-3">{d.storeName ?? '—'}</td>}
                      <td className="p-3">{d.customerName}</td>
                      <td className="p-3">{d.delivererName}</td>
                      <td className="p-3">{formatWaitTime(d.waitTimeSeconds)}</td>
                      <td className="p-3">{formatWaitTime(d.routeDurationSeconds)}</td>
                      <td className="p-3">{formatWaitTime(d.totalDeliveryTimeSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </PaginatedList>
        </>
      )}

      {metrics?.byDeliverer && metrics.byDeliverer.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">Por entregador</h2>
          <PaginatedList items={metrics.byDeliverer}>
            {(rows) => (
              <Table>
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-3">Entregador</th>
                    <th className="p-3">Rotas realizadas</th>
                    <th className="p-3">Rotas canceladas</th>
                    <th className="p-3">Tempo médio até aceitar</th>
                    <th className="p-3">Tempo médio em rota</th>
                    <th className="p-3">Tempo médio total da entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.delivererId} className="border-t border-slate-100">
                      <td className="p-3">{d.delivererName}</td>
                      <td className="p-3">{d.completedCount}</td>
                      <td className="p-3">{d.cancelledCount}</td>
                      <td className="p-3">{formatWaitTime(d.avgWaitTimeSeconds)}</td>
                      <td className="p-3">{formatWaitTime(d.avgRouteDurationSeconds)}</td>
                      <td className="p-3">{formatWaitTime(d.avgTotalDeliveryTimeSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </PaginatedList>
        </>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Por forma de pagamento</h2>
      {paymentEntries.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum pagamento no período.</p>
      ) : (
        <PaginatedList items={paymentEntries}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Forma</th>
                  <th className="p-3">Bruto</th>
                  {showFinancial && <th className="p-3">Taxa</th>}
                  {showFinancial && <th className="p-3">Líquido</th>}
                  {showFinancial && <th className="p-3">CMV</th>}
                  {showFinancial && <th className="p-3">Lucro bruto</th>}
                  {showFinancial && <th className="p-3">Lucro líquido</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.label} className="border-t border-slate-100">
                    <td className="p-3">{entry.label}</td>
                    <td className="p-3">{formatCurrency(entry.revenue)}</td>
                    {showFinancial && (
                      <td className="p-3">{formatCurrency(entry.processingFees ?? 0)}</td>
                    )}
                    {showFinancial && (
                      <td className="p-3">{formatCurrency(entry.netRevenue ?? entry.revenue)}</td>
                    )}
                    {showFinancial && (
                      <td className="p-3">{formatCurrency(entry.totalCost ?? 0)}</td>
                    )}
                    {showFinancial && (
                      <td className="p-3">{formatCurrency(entry.grossProfit ?? 0)}</td>
                    )}
                    {showFinancial && (
                      <td className="p-3">{formatCurrency(entry.netProfit ?? entry.grossProfit ?? 0)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Produtos vendidos</h2>
      {data.productsSold.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum produto vendido no período.</p>
      ) : (
        <PaginatedList items={data.productsSold}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Qtd</th>
                  <th className="p-3">Total</th>
                  {showFinancial && <th className="p-3">CMV</th>}
                  {showFinancial && <th className="p-3">Lucro bruto</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.name} className="border-t border-slate-100">
                    <td className="p-3">{p.name}</td>
                    <td className="p-3">{p.qty}</td>
                    <td className="p-3">{formatCurrency(p.total)}</td>
                    {showFinancial && (
                      <td className="p-3">{formatCurrency(p.totalCost ?? 0)}</td>
                    )}
                    {showFinancial && (
                      <td className="p-3">{formatCurrency(p.grossProfit ?? 0)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}
    </>
  );
}
