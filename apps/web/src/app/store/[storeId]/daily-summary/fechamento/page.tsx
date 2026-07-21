'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
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
import { buildStoreHref } from '@/lib/store-nav';
import { todayDateKey } from '@gas-erp/shared';

export default function StoreCashClosingPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get('from') ?? todayDateKey;
  const initialTo = searchParams.get('to') ?? initialFrom;
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const [storeName, setStoreName] = useState('');
  const query = useMemo(() => buildDashboardDateQuery(dateFrom, dateTo), [dateFrom, dateTo]);

  useEffect(() => {
    api<{ id: string; name: string }[]>('/stores', {}, getToken())
      .then((stores) => setStoreName(stores.find((s) => s.id === storeId)?.name ?? ''))
      .catch(() => undefined);
  }, [storeId]);

  const { data, loading, isRefetching, error } = useLiveQuery<DailySummaryData>(
    (signal) => api(`/dashboard/store?storeId=${storeId}&${query}`, { signal }, getToken()),
    [storeId, query],
    { enabled: Boolean(storeId), realtime: { type: 'store', storeId } },
  );

  if (loading && !data) return <PageLoader label="Carregando fechamento…" />;

  return (
    <>
      <PageHeader
        title="Fechamento de Caixa"
        subtitle={storeName || 'Unidade'}
        action={
          <Link
            href={buildStoreHref(storeId, 'daily-summary')}
            className="print-hide inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao resumo
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

      {data && (
        <LoadingOverlay loading={isRefetching} minHeight="min-h-[40vh]" label="Atualizando fechamento…">
          <CashClosingView data={data} title={storeName || 'Unidade'} subtitle={data.date} />
        </LoadingOverlay>
      )}
    </>
  );
}
