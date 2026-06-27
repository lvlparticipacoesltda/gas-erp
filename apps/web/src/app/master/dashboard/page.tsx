'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { DailySummaryContent, type DailySummaryData } from '@/components/daily-summary-content';
import { DailySummaryDateFilter } from '@/components/daily-summary-date-filter';
import { LoadingOverlay } from '@/components/loading-overlay';
import { Card, PageHeader } from '@/components/ui';
import { DASHBOARD_POLL_INTERVAL_MS, useLiveQuery } from '@/hooks/use-live-query';
import { api, getToken, setCurrentStoreId } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { formatCurrency } from '@/lib/utils';
import { todayDateKey } from '@gas-erp/shared';

interface StoreStat {
  store: { id: string; name: string; code: string; city?: string };
  salesCount: number;
  salesTotal: number;
  activeDeliveries: number;
  totalCost?: number;
  grossProfit?: number;
  totalProcessingFees?: number;
  netProfit?: number;
}

export default function MasterDashboardPage() {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(todayDateKey);
  const [dateTo, setDateTo] = useState(todayDateKey);
  const query = useMemo(() => buildDashboardDateQuery(dateFrom, dateTo), [dateFrom, dateTo]);

  const { data, loading, isRefetching, error } = useLiveQuery<{
    stores: StoreStat[];
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    summary?: DailySummaryData;
  }>(
    () => api(`/dashboard/master?${query}`, {}, getToken()),
    [query],
  );

  function openStore(id: string) {
    if (isRefetching) return;
    setCurrentStoreId(id);
    router.push(`/store/${id}/daily-summary`);
  }

  const isRange = dateFrom !== dateTo;
  const salesLabel = isRange ? 'Vendas no período' : 'Vendas hoje';
  const revenueLabel = isRange ? 'Faturamento no período' : 'Faturamento';
  const showFinancial = data?.summary?.totalCost != null && data?.summary?.grossProfit != null;
  const showNetFinancial = showFinancial && data?.summary?.netRevenue != null;

  if (loading && !data) return <PageLoader label="Carregando visão geral…" />;

  return (
    <>
      <PageHeader
        title="Painel Master"
        subtitle={
          data?.date
            ? `Visão consolidada · ${data.date} · atualiza a cada ${DASHBOARD_POLL_INTERVAL_MS / 1000}s`
            : `Visão consolidada de todas as unidades · atualiza a cada ${DASHBOARD_POLL_INTERVAL_MS / 1000}s`
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

      <LoadingOverlay loading={isRefetching} minHeight="min-h-[50vh]" label="Atualizando período…">
        <>
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
                    {showFinancial && (
                      <>
                        <div>
                          <div className="text-slate-500">CMV</div>
                          <div className="font-semibold">{formatCurrency(s.totalCost ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Lucro bruto</div>
                          <div className="font-semibold">{formatCurrency(s.grossProfit ?? 0)}</div>
                        </div>
                        {showNetFinancial && (
                          <>
                            <div>
                              <div className="text-slate-500">Taxas pagamento</div>
                              <div className="font-semibold">{formatCurrency(s.totalProcessingFees ?? 0)}</div>
                            </div>
                            <div>
                              <div className="text-slate-500">Lucro líquido</div>
                              <div className="font-semibold">{formatCurrency(s.netProfit ?? 0)}</div>
                            </div>
                          </>
                        )}
                      </>
                    )}
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
      </LoadingOverlay>
    </>
  );
}
