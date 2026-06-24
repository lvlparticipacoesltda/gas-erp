'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Card, PageHeader } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

export default function StoreDashboardPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!storeId) return;
    api<Record<string, unknown>>(`/dashboard/store?storeId=${storeId}`, {}, getToken()).then(setData);
  }, [storeId]);

  return (
    <AppShell mode="store">
      <PageHeader title="Dashboard da loja" subtitle="Resumo operacional do dia" />
      <div className="grid gap-4 md:grid-cols-4">
        <Card><div className="text-sm text-slate-500">Faturamento hoje</div><div className="text-2xl font-bold">{formatCurrency(Number(data?.revenue ?? 0))}</div></Card>
        <Card><div className="text-sm text-slate-500">Vendas</div><div className="text-2xl font-bold">{String(data?.salesCount ?? 0)}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas pendentes</div><div className="text-2xl font-bold">{String((data?.deliveries as { pending?: number })?.pending ?? 0)}</div></Card>
        <Card><div className="text-sm text-slate-500">Entregas concluídas</div><div className="text-2xl font-bold">{String((data?.deliveries as { completed?: number })?.completed ?? 0)}</div></Card>
      </div>
    </AppShell>
  );
}
