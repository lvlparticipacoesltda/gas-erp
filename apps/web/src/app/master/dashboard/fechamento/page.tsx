'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { CashClosingView } from '@/components/cash-closing-view';
import type { DailySummaryData } from '@/components/daily-summary-content';
import { DailySummaryDateFilter } from '@/components/daily-summary-date-filter';
import { LoadingOverlay } from '@/components/loading-overlay';
import { PageHeader } from '@/components/ui';
import { useLiveQuery } from '@/hooks/use-live-query';
import { api, getToken } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { todayDateKey } from '@gas-erp/shared';

export default function MasterCashClosingPage() {
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get('from') ?? todayDateKey;
  const initialTo = searchParams.get('to') ?? initialFrom;
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const query = useMemo(() => buildDashboardDateQuery(dateFrom, dateTo), [dateFrom, dateTo]);

  const { data, loading, isRefetching, error } = useLiveQuery<{
    date?: string;
    summary?: DailySummaryData;
  }>(
    (signal) => api(`/dashboard/master?${query}`, { signal }, getToken()),
    [query],
    { realtime: { type: 'org' } },
  );

  if (loading && !data) return <PageLoader label="Carregando fechamento…" />;

  return (
    <>
      <PageHeader
        title="Fechamento de Caixa"
        subtitle="Todas as unidades"
        action={
          <Link
            href="/master/dashboard"
            className="print-hide inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à visão geral
          </Link>
        }
      />

      <div className="print-hide">
        <DailySummaryDateFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          disabled={isRefetching}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {data?.summary && (
        <LoadingOverlay loading={isRefetching} minHeight="min-h-[40vh]" label="Atualizando fechamento…">
          <CashClosingView
            data={data.summary}
            title="Todas as unidades"
            subtitle={data.date}
          />
        </LoadingOverlay>
      )}
    </>
  );
}
