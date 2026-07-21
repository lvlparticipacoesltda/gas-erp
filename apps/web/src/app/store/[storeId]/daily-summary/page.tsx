'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { DailySummaryContent, type DailySummaryData } from '@/components/daily-summary-content';
import { DailySummaryDateFilter } from '@/components/daily-summary-date-filter';
import { LoadingOverlay } from '@/components/loading-overlay';
import { PageHeader } from '@/components/ui';
import { useLiveQuery } from '@/hooks/use-live-query';
import { api, getToken } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { buildStoreHref } from '@/lib/store-nav';
import { todayDateKey } from '@gas-erp/shared';

export default function DailySummaryPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [dateFrom, setDateFrom] = useState(todayDateKey);
  const [dateTo, setDateTo] = useState(todayDateKey);
  const query = useMemo(() => buildDashboardDateQuery(dateFrom, dateTo), [dateFrom, dateTo]);

  const { data, loading, isRefetching, error } = useLiveQuery<DailySummaryData>(
    (signal) => api(`/dashboard/store?storeId=${storeId}&${query}`, { signal }, getToken()),
    [storeId, query],
    { enabled: Boolean(storeId), realtime: { type: 'store', storeId } },
  );

  if (loading && !data) return <PageLoader label="Carregando resumo…" />;

  return (
    <>
      <PageHeader
        title="Resumo diário"
        subtitle={
          data?.date
            ? `Fechamento operacional · ${data.date} · atualização em tempo real`
            : 'Fechamento operacional da unidade · atualização em tempo real'
        }
        action={
          <Link
            href={`${buildStoreHref(storeId, 'daily-summary/fechamento')}?from=${dateFrom}&to=${dateTo}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Calculator className="h-4 w-4" />
            Fechamento de Caixa
          </Link>
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
