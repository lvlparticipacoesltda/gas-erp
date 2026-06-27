'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { DailySummaryContent, type DailySummaryData } from '@/components/daily-summary-content';
import { DailySummaryDateFilter } from '@/components/daily-summary-date-filter';
import { LoadingOverlay } from '@/components/loading-overlay';
import { PageHeader } from '@/components/ui';
import { DASHBOARD_POLL_INTERVAL_MS, useLiveQuery } from '@/hooks/use-live-query';
import { api, getToken } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { todayDateKey } from '@gas-erp/shared';

export default function DailySummaryPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [dateFrom, setDateFrom] = useState(todayDateKey);
  const [dateTo, setDateTo] = useState(todayDateKey);
  const query = useMemo(() => buildDashboardDateQuery(dateFrom, dateTo), [dateFrom, dateTo]);

  const { data, loading, isRefetching, error } = useLiveQuery<DailySummaryData>(
    () => api(`/dashboard/store?storeId=${storeId}&${query}`, {}, getToken()),
    [storeId, query],
    { enabled: Boolean(storeId) },
  );

  if (loading && !data) return <PageLoader label="Carregando resumo…" />;

  return (
    <>
      <PageHeader
        title="Resumo diário"
        subtitle={
          data?.date
            ? `Fechamento operacional · ${data.date} · atualiza a cada ${DASHBOARD_POLL_INTERVAL_MS / 1000}s`
            : `Fechamento operacional da unidade · atualiza a cada ${DASHBOARD_POLL_INTERVAL_MS / 1000}s`
        }
      />

      <DailySummaryDateFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        disabled={isRefetching}
        onChange={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
        }}
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {data && (
        <LoadingOverlay loading={isRefetching} minHeight="min-h-[40vh]" label="Atualizando resumo…">
          <DailySummaryContent data={data} />
        </LoadingOverlay>
      )}
    </>
  );
}
