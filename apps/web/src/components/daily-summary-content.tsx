'use client';

import { Card, Table } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { formatWaitTime } from '@gas-erp/shared';

export interface DailySummaryData {
  date: string;
  revenue: number;
  salesCount: number;
  paymentsByMethod: Record<string, number>;
  productsSold: { name: string; qty: number; total: number }[];
  deliveries: { pending: number; inProgress: number; completed: number };
  deliveryMetrics?: {
    avgWaitTimeSeconds: number | null;
    maxWaitTimeSeconds: number | null;
    avgRouteDurationSeconds: number | null;
    maxRouteDurationSeconds: number | null;
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
}

interface DailySummaryContentProps {
  data: DailySummaryData;
  showStoreInSlowDeliveries?: boolean;
}

export function DailySummaryContent({ data, showStoreInSlowDeliveries }: DailySummaryContentProps) {
  const metrics = data.deliveryMetrics;
  const showStoreColumn =
    showStoreInSlowDeliveries ??
    (metrics?.slowDeliveries.some((d) => d.storeName) ?? false);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card><div className="text-sm text-slate-500">Faturamento hoje</div><div className="text-2xl font-bold">{formatCurrency(data.revenue)}</div></Card>
        <Card><div className="text-sm text-slate-500">Vendas</div><div className="text-2xl font-bold">{data.salesCount}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas pendentes</div><div className="text-2xl font-bold">{data.deliveries.pending}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas em rota</div><div className="text-2xl font-bold">{data.deliveries.inProgress}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas concluídas</div><div className="text-2xl font-bold">{data.deliveries.completed}</div></Card>
        <Card><div className="text-sm text-slate-500">Tempo médio até a rota</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.avgWaitTimeSeconds)}</div></Card>
        <Card><div className="text-sm text-slate-500">Maior espera até a rota</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.maxWaitTimeSeconds)}</div></Card>
        <Card><div className="text-sm text-slate-500">Tempo médio em rota</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.avgRouteDurationSeconds)}</div></Card>
        <Card><div className="text-sm text-slate-500">Maior tempo em rota</div><div className="text-2xl font-bold">{formatWaitTime(metrics?.maxRouteDurationSeconds)}</div></Card>
      </div>

      {metrics?.slowDeliveries && metrics.slowDeliveries.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">Entregas com tempo elevado</h2>
          <Table>
            <thead className="bg-slate-50 text-left">
              <tr>
                {showStoreColumn && <th className="p-3">Unidade</th>}
                <th className="p-3">Cliente</th>
                <th className="p-3">Entregador</th>
                <th className="p-3">Espera até a rota</th>
                <th className="p-3">Tempo em rota</th>
              </tr>
            </thead>
            <tbody>
              {metrics.slowDeliveries.map((d) => (
                <tr key={d.saleId} className="border-t border-slate-100">
                  {showStoreColumn && <td className="p-3">{d.storeName ?? '—'}</td>}
                  <td className="p-3">{d.customerName}</td>
                  <td className="p-3">{d.delivererName}</td>
                  <td className="p-3">{formatWaitTime(d.waitTimeSeconds)}</td>
                  <td className="p-3">{formatWaitTime(d.routeDurationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {metrics?.byDeliverer && metrics.byDeliverer.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">Por entregador</h2>
          <Table>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Entregador</th>
                <th className="p-3">Entregas</th>
                <th className="p-3">Média até aceitar rota</th>
                <th className="p-3">Média para finalizar rota</th>
              </tr>
            </thead>
            <tbody>
              {metrics.byDeliverer.map((d) => (
                <tr key={d.delivererId} className="border-t border-slate-100">
                  <td className="p-3">{d.delivererName}</td>
                  <td className="p-3">{d.deliveryCount}</td>
                  <td className="p-3">{formatWaitTime(d.avgWaitTimeSeconds)}</td>
                  <td className="p-3">{formatWaitTime(d.avgRouteDurationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Por forma de pagamento</h2>
      <Table>
        <thead className="bg-slate-50 text-left"><tr><th className="p-3">Forma</th><th className="p-3">Valor</th></tr></thead>
        <tbody>
          {Object.entries(data.paymentsByMethod).map(([method, value]) => (
            <tr key={method} className="border-t border-slate-100"><td className="p-3">{method}</td><td className="p-3">{formatCurrency(value)}</td></tr>
          ))}
        </tbody>
      </Table>

      <h2 className="mb-3 mt-8 font-semibold">Produtos vendidos</h2>
      <Table>
        <thead className="bg-slate-50 text-left"><tr><th className="p-3">Produto</th><th className="p-3">Qtd</th><th className="p-3">Total</th></tr></thead>
        <tbody>
          {data.productsSold.map((p) => (
            <tr key={p.name} className="border-t border-slate-100"><td className="p-3">{p.name}</td><td className="p-3">{p.qty}</td><td className="p-3">{formatCurrency(p.total)}</td></tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
