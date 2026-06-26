'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { DailySummaryContent, type DailySummaryData } from '@/components/daily-summary-content';
import { PageHeader } from '@/components/ui';
import { api, getToken } from '@/lib/api';

export default function DailySummaryPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [data, setData] = useState<DailySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    api<DailySummaryData>(`/dashboard/store?storeId=${storeId}`, {}, getToken())
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
      })
      .finally(() => setLoading(false));
  }, [storeId]);

  if (loading) return <PageLoader />;

  if (error) {
    return (
      <>
        <PageHeader title="Resumo diário" subtitle="Fechamento operacional da unidade" />
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      </>
    );
  }

  if (!data) return null;

  return (
    <>
      <PageHeader
        title="Resumo diário"
        subtitle={data.date ? `Fechamento operacional · ${data.date.split('-').reverse().join('/')}` : 'Fechamento operacional da unidade'}
      />
      <DailySummaryContent data={data} />
    </>
  );
}
