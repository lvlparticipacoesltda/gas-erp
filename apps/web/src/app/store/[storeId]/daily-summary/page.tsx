'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Card, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

export default function DailySummaryPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [data, setData] = useState<{
    revenue: number;
    paymentsByMethod: Record<string, number>;
    productsSold: { name: string; qty: number; total: number }[];
    deliveries: { pending: number; completed: number };
  } | null>(null);

  useEffect(() => {
    if (!storeId) return;
    api<typeof data>(`/dashboard/store?storeId=${storeId}`, {}, getToken()).then(setData);
  }, [storeId]);

  return (
    <AppShell mode="store">
      <PageHeader title="Resumo diário" subtitle="Fechamento operacional da unidade" />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><div className="text-sm text-slate-500">Faturamento</div><div className="text-2xl font-bold">{formatCurrency(data?.revenue ?? 0)}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas pendentes</div><div className="text-2xl font-bold">{data?.deliveries.pending ?? 0}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas concluídas</div><div className="text-2xl font-bold">{data?.deliveries.completed ?? 0}</div></Card>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Por forma de pagamento</h2>
      <Table>
        <thead className="bg-slate-50 text-left"><tr><th className="p-3">Forma</th><th className="p-3">Valor</th></tr></thead>
        <tbody>
          {Object.entries(data?.paymentsByMethod ?? {}).map(([method, value]) => (
            <tr key={method} className="border-t border-slate-100"><td className="p-3">{method}</td><td className="p-3">{formatCurrency(value)}</td></tr>
          ))}
        </tbody>
      </Table>
      <h2 className="mb-3 mt-8 font-semibold">Produtos vendidos</h2>
      <Table>
        <thead className="bg-slate-50 text-left"><tr><th className="p-3">Produto</th><th className="p-3">Qtd</th><th className="p-3">Total</th></tr></thead>
        <tbody>
          {(data?.productsSold ?? []).map((p) => (
            <tr key={p.name} className="border-t border-slate-100"><td className="p-3">{p.name}</td><td className="p-3">{p.qty}</td><td className="p-3">{formatCurrency(p.total)}</td></tr>
          ))}
        </tbody>
      </Table>
    </AppShell>
  );
}
