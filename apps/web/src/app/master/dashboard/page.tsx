'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { DailySummaryContent, type DailySummaryData } from '@/components/daily-summary-content';
import { DailySummaryDateFilter } from '@/components/daily-summary-date-filter';
import { Card, PageHeader } from '@/components/ui';
import { api, getToken, setCurrentStoreId } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { formatCurrency } from '@/lib/utils';
import { todayDateKey } from '@gas-erp/shared';

interface StoreStat {
  store: { id: string; name: string; code: string; city?: string };
  salesCount: number;
  salesTotal: number;
  activeDeliveries: number;
  lowStockItems: number;
}

export default function MasterDashboardPage() {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(todayDateKey);
  const [dateTo, setDateTo] = useState(todayDateKey);
  const [data, setData] = useState<{
    stores: StoreStat[];
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    summary?: DailySummaryData;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const query = buildDashboardDateQuery(dateFrom, dateTo);
    api<{
      stores: StoreStat[];
      date?: string;
      dateFrom?: string;
      dateTo?: string;
      summary?: DailySummaryData;
    }>(`/dashboard/master?${query}`, {}, getToken())
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : 'Erro ao carregar visão geral');
      })
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  function openStore(id: string) {
    setCurrentStoreId(id);
    router.push(`/store/${id}/daily-summary`);
  }

  if (loading && !data) return <PageLoader />;

  const isRange = dateFrom !== dateTo;
  const salesLabel = isRange ? 'Vendas no período' : 'Vendas hoje';
  const revenueLabel = isRange ? 'Faturamento no período' : 'Faturamento';

  return (
    <>
      <PageHeader
        title="Painel Master"
        subtitle={data?.date ? `Visão consolidada · ${data.date}` : 'Visão consolidada de todas as unidades'}
      />

      <DailySummaryDateFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
        }}
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {loading && <p className="mb-4 text-sm text-slate-500">Atualizando...</p>}

      <h2 className="mb-3 font-semibold">Unidades</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.stores.map((s) => (
          <button
            key={s.store.id}
            type="button"
            onClick={() => openStore(s.store.id)}
            className="text-left transition hover:scale-[1.01]"
          >
            <Card className="cursor-pointer hover:border-brand-light hover:shadow-md">
              <div className="text-lg font-semibold">{s.store.name}</div>
              <div className="text-sm text-slate-500">{s.store.city} · {s.store.code}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-slate-500">{salesLabel}</div>
                  <div className="font-semibold">{s.salesCount}</div>
                </div>
                <div>
                  <div className="text-slate-500">{revenueLabel}</div>
                  <div className="font-semibold">{formatCurrency(s.salesTotal)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Entregas ativas</div>
                  <div className="font-semibold">{s.activeDeliveries}</div>
                </div>
                <div>
                  <div className="text-slate-500">Estoque baixo</div>
                  <div className="font-semibold">{s.lowStockItems}</div>
                </div>
              </div>
              <div className="mt-3 text-sm font-medium text-brand">Abrir loja →</div>
            </Card>
          </button>
        ))}
      </div>

      {data?.summary && (
        <section className="mt-10 border-t border-slate-200 pt-8">
          <h2 className="mb-1 text-xl font-semibold">Resumo diário consolidado</h2>
          <p className="mb-6 text-sm text-slate-500">
            Todas as unidades · {data.date ?? 'hoje'}
          </p>
          <DailySummaryContent data={data.summary} showStoreInSlowDeliveries />
        </section>
      )}
    </>
  );
}
