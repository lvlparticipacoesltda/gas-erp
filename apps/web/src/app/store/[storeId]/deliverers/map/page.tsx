'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, RefreshCw } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { Badge, Card, PageHeader } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { buildStoreHref } from '@/lib/store-nav';
import type { DelivererPosition } from '@gas-erp/shared';
import { DELIVERER_STATUS_LABELS, DELIVERY_STATUS_LABELS } from '@gas-erp/shared';

const REFRESH_INTERVAL_MS = 20_000;

const DelivererPositionsMap = dynamic(
  () =>
    import('@/components/deliverer-positions-map').then((m) => m.DelivererPositionsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
        Carregando mapa…
      </div>
    ),
  },
);

function formatTime(iso: string | null): string {
  if (!iso) return 'Sem registro';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function DelivererMapPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [positions, setPositions] = useState<DelivererPosition[]>([]);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const data = await api<DelivererPosition[]>(
      `/deliverers/positions?storeId=${storeId}`,
      {},
      getToken(),
    );
    setPositions(data);
    setLastUpdated(new Date());
  }, [storeId]);

  useEffect(() => {
    load()
      .catch(() => setPositions([]))
      .finally(() => setReady(true));
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshing(true);
      load()
        .catch(() => undefined)
        .finally(() => setRefreshing(false));
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const withPosition = useMemo(
    () => positions.filter((p) => p.latitude !== null && p.longitude !== null),
    [positions],
  );

  const recentCount = useMemo(
    () => withPosition.filter((p) => !p.stale).length,
    [withPosition],
  );

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Mapa de entregadores"
        subtitle={
          lastUpdated
            ? `${recentCount} com posição recente · atualizado às ${lastUpdated.toLocaleTimeString('pt-BR')}`
            : 'Posições em tempo quase real'
        }
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                load().finally(() => setRefreshing(false));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <Link
              href={buildStoreHref(storeId, 'deliverers')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Lista de entregadores
            </Link>
          </div>
        }
      />

      {withPosition.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <MapPin className="h-10 w-10 text-slate-300" />
          <p className="text-lg font-medium text-slate-700">Nenhum entregador com posição recente</p>
          <p className="max-w-md text-sm text-slate-500">
            As posições aparecem quando um entregador inicia a rota no app mobile e o GPS está
            ativo. A atualização automática ocorre a cada 20 segundos.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden p-0">
            <DelivererPositionsMap
              positions={positions}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Card>

          <Card className="flex max-h-[560px] flex-col">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
              Entregadores ({positions.length})
            </h2>
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {positions.map((p) => {
                const hasCoords = p.latitude !== null && p.longitude !== null;
                const isSelected = selectedId === p.delivererId;
                return (
                  <li key={p.delivererId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.delivererId)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected ? 'bg-orange-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{p.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {DELIVERER_STATUS_LABELS[p.delivererStatus] ?? p.delivererStatus}
                          </p>
                        </div>
                        {hasCoords ? (
                          <Badge tone={p.stale ? 'default' : 'warning'}>
                            {p.stale ? 'Desatualizado' : 'Em rota'}
                          </Badge>
                        ) : (
                          <Badge tone="default">Sem GPS</Badge>
                        )}
                      </div>
                      {p.deliveryStatus && (
                        <p className="mt-1 text-xs text-slate-600">
                          Entrega: {DELIVERY_STATUS_LABELS[p.deliveryStatus] ?? p.deliveryStatus}
                        </p>
                      )}
                      {hasCoords && (
                        <p className="mt-1 text-xs text-slate-500">
                          {formatTime(p.lastSeenAt)}
                        </p>
                      )}
                      {p.stores.length > 1 && (
                        <p className="mt-1 text-xs text-slate-400">
                          Unidades: {p.stores.map((s) => s.name).join(', ')}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
