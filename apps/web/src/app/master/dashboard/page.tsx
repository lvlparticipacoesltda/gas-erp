'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { Card, PageHeader } from '@/components/ui';
import { api, getToken, setCurrentStoreId } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface StoreStat {
  store: { id: string; name: string; code: string; city?: string };
  salesCount: number;
  salesTotal: number;
  activeDeliveries: number;
  lowStockItems: number;
}

export default function MasterDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<{ stores: StoreStat[]; date?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ stores: StoreStat[]; date?: string }>('/dashboard/master', {}, getToken())
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : 'Erro ao carregar visão geral');
      })
      .finally(() => setLoading(false));
  }, []);

  function openStore(id: string) {
    setCurrentStoreId(id);
    router.push(`/store/${id}/daily-summary`);
  }

  if (loading) return <PageLoader />;

  if (error) {
    return (
      <>
        <PageHeader title="Painel Master" subtitle="Visão consolidada de todas as unidades" />
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      </>
    );
  }

  const dateLabel = data?.date?.split('-').reverse().join('/');

  return (
    <>
      <PageHeader
        title="Painel Master"
        subtitle={dateLabel ? `Visão consolidada · ${dateLabel}` : 'Visão consolidada de todas as unidades'}
      />
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
                  <div className="text-slate-500">Vendas hoje</div>
                  <div className="font-semibold">{s.salesCount}</div>
                </div>
                <div>
                  <div className="text-slate-500">Faturamento</div>
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
    </>
  );
}
