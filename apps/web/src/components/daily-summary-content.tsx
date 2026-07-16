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
      glpQuantity: number;
      gdpQuantity: number;
      gdpRevenue: number;
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

  const stock = data.stockGlp;
  const gdp = data.gasDoPovo;
  const portaria = data.portaria;

  return (
    <>
      <h2 className="mb-3 font-semibold">Estoque de gás (GLP)</h2>
      {stock.products.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum produto de gás cadastrado.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <Table>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Produto</th>
                <th className="p-3 text-right">Estoque inicial</th>
                <th className="p-3 text-right">Saídas</th>
                <th className="p-3 text-right">Estoque final</th>
              </tr>
            </thead>
            <tbody>
              {stock.products.map((p) => (
                <tr key={p.productId} className="border-t border-slate-100">
                  <td className="p-3">
                    {p.name}
                    {p.sku ? <span className="ml-1 text-xs text-slate-400">({p.sku})</span> : null}
                  </td>
                  <td className="p-3 text-right tabular-nums">{p.opening}</td>
                  <td className="p-3 text-right font-semibold tabular-nums text-rose-600">{p.out}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{p.closing}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="p-3">Total</td>
                <td className="p-3 text-right tabular-nums">{stock.totals.opening}</td>
                <td className="p-3 text-right tabular-nums text-rose-600">{stock.totals.out}</td>
                <td className="p-3 text-right tabular-nums">{stock.totals.closing}</td>
              </tr>
            </tfoot>
          </Table>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border-brand/40 bg-brand/5">
          <div className="text-sm text-slate-500">Botijas GLP vendidas {periodLabel}</div>
          <div className="text-3xl font-extrabold text-brand-dark">{data.glpQuantitySold}</div>
        </Card>
        <Card className="border-emerald-300 bg-emerald-50">
          <div className="text-sm text-slate-500">Gás do Povo {periodLabel}</div>
          <div className="flex items-baseline gap-3">
            <div>
              <div className="text-3xl font-extrabold text-emerald-700">{gdp.quantity}</div>
              <div className="text-xs text-slate-500">botijas</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-700">{formatCurrency(gdp.revenue)}</div>
              <div className="text-xs text-slate-500">{gdp.salesCount} vendas</div>
            </div>
          </div>
        </Card>
        <Card className="border-sky-300 bg-sky-50">
          <div className="text-sm text-slate-500">Portaria {periodLabel}</div>
          <div className="flex items-baseline gap-3">
            <div>
              <div className="text-3xl font-extrabold text-sky-800">{portaria.glpQuantity}</div>
              <div className="text-xs text-slate-500">botijas</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-sky-800">{portaria.salesCount}</div>
              <div className="text-xs text-slate-500">pedidos</div>
            </div>
          </div>
        </Card>
        <Card><div className="text-sm text-slate-500">Faturamento {periodLabel}</div><div className="text-2xl font-bold">{formatCurrency(data.revenue)}</div></Card>
        <Card><div className="text-sm text-slate-500">Pedidos {periodLabel}</div><div className="text-2xl font-bold">{data.salesCount}</div></Card>
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
      </div>

      {metrics?.byDeliverer && metrics.byDeliverer.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">Por entregador</h2>
          <PaginatedList items={metrics.byDeliverer}>
            {(rows) => (
              <Table>
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-3">Entregador</th>
                    <th className="p-3 text-right">GLP entregue</th>
                    <th className="p-3 text-right">Gás do Povo</th>
                    <th className="p-3 text-right">Valor Gás do Povo</th>
                    <th className="p-3 text-right">Rotas realizadas</th>
                    <th className="p-3 text-right">Rotas canceladas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.delivererId} className="border-t border-slate-100">
                      <td className="p-3">{d.delivererName}</td>
                      <td className="p-3 text-right font-semibold tabular-nums text-brand-dark">{d.glpQuantity}</td>
                      <td className="p-3 text-right font-semibold tabular-nums text-emerald-700">{d.gdpQuantity}</td>
                      <td className="p-3 text-right tabular-nums text-emerald-700">{formatCurrency(d.gdpRevenue)}</td>
                      <td className="p-3 text-right tabular-nums">{d.completedCount}</td>
                      <td className="p-3 text-right tabular-nums">{d.cancelledCount}</td>
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

      <h2 className="mb-3 mt-8 font-semibold">Entregas</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><div className="text-sm text-slate-500">Pendentes</div><div className="text-2xl font-bold">{data.deliveries.pending}</div></Card>
        <Card><div className="text-sm text-slate-500">Em rota</div><div className="text-2xl font-bold">{data.deliveries.inProgress}</div></Card>
        <Card><div className="text-sm text-slate-500">Concluídas</div><div className="text-2xl font-bold">{data.deliveries.completed}</div></Card>
        <Card><div className="text-sm text-slate-500">Rotas canceladas</div><div className="text-2xl font-bold">{data.deliveries.cancelled}</div></Card>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Desempenho</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
    </>
  );
}
