'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { DailySummaryContent, type DailySummaryData } from '@/components/daily-summary-content';
import { DailySummaryDateFilter } from '@/components/daily-summary-date-filter';
import { PageHeader } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { todayDateKey } from '@gas-erp/shared';

export default function DailySummaryPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [dateFrom, setDateFrom] = useState(todayDateKey);
  const [dateTo, setDateTo] = useState(todayDateKey);
  const [data, setData] = useState<DailySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    const query = buildDashboardDateQuery(dateFrom, dateTo);
    api<DailySummaryData>(`/dashboard/store?storeId=${storeId}&${query}`, {}, getToken())
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
      })
      .finally(() => setLoading(false));
  }, [storeId, dateFrom, dateTo]);

  if (loading && !data) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="Resumo diário"
        subtitle={
          data?.date
            ? `Fechamento operacional · ${data.date}`
            : 'Fechamento operacional da unidade'
        }
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

      {data && <DailySummaryContent data={data} />}
    </>
  );
}
