'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, RefreshCw } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { DelivererMapCard, DelivererOfflineCard } from '@/components/deliverer-map-card';
import { api, getStoredUser, getToken, refreshStoredUser } from '@/lib/api';
import { buildStoreHref } from '@/lib/store-nav';
import type { AuthUser, DelivererPosition } from '@gas-erp/shared';
import { canToggleDelivererAvailability, getDelivererAvailabilityLock } from '@gas-erp/shared';

const REFRESH_INTERVAL_MS = 15_000;

interface DelivererListItem {
  id: string;
  status: string;
  availableStoreId?: string | null;
  user: { name: string; active: boolean };
}

const DelivererPositionsMap = dynamic(
  () =>
    import('@/components/deliverer-positions-map').then((m) => m.DelivererPositionsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">
        Carregando mapa…
      </div>
    ),
  },
);

export default function DelivererMapPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [positions, setPositions] = useState<DelivererPosition[]>([]);
  const [offlineDeliverers, setOfflineDeliverers] = useState<DelivererListItem[]>([]);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [canToggleAvailability, setCanToggleAvailability] = useState(() => {
    const user = getStoredUser<AuthUser>();
    return user ? canToggleDelivererAvailability(user.role, user.permissions) : false;
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    void refreshStoredUser().then((user) => {
      setCanToggleAvailability(
        user ? canToggleDelivererAvailability(user.role, user.permissions) : false,
      );
    });
  }, []);

  const loadOffline = useCallback(async (onPanelIds: Set<string>) => {
    const all = await api<DelivererListItem[]>(`/deliverers?storeId=${storeId}`, {}, getToken());
    setOfflineDeliverers(
      all.filter(
        (d) =>
          d.user.active
          && !onPanelIds.has(d.id)
          && d.status !== 'ON_DELIVERY'
          && d.availableStoreId !== storeId,
      ),
    );
  }, [storeId]);

  const loadAll = useCallback(async () => {
    const data = await api<DelivererPosition[]>(
      `/deliverers/positions?storeId=${storeId}`,
      {},
      getToken(),
    );
    setPositions(data);
    setLastUpdated(new Date());
    if (canToggleAvailability) {
      const onPanelIds = new Set(data.map((p) => p.delivererId));
      await loadOffline(onPanelIds).catch(() => setOfflineDeliverers([]));
    }
  }, [storeId, loadOffline, canToggleAvailability]);

  useEffect(() => {
    loadAll()
      .catch(() => setPositions([]))
      .finally(() => setReady(true));
  }, [loadAll]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshing(true);
      loadAll()
        .catch(() => undefined)
        .finally(() => setRefreshing(false));
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadAll]);

  async function setAvailability(delivererId: string, available: boolean) {
    if (!available) {
      const deliverer = positions.find((p) => p.delivererId === delivererId);
      const lock = deliverer ? getDelivererAvailabilityLock(deliverer) : null;
      if (lock?.locked) return;

      const name = deliverer?.name ?? offlineDeliverers.find((d) => d.id === delivererId)?.user.name;
      const ok = confirm(
        `Marcar ${name ?? 'entregador'} como indisponível?\n\nEle deixará de aparecer no mapa até ser reativado.`,
      );
      if (!ok) return;
    }

    setSavingId(delivererId);
    setActionError('');
    try {
      await api(
        `/deliverers/${delivererId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: available ? 'AVAILABLE' : 'OFFLINE',
            availableStoreId: available ? storeId : null,
          }),
        },
        getToken(),
      );
      if (selectedId === delivererId && !available) {
        setSelectedId(null);
      }
      await loadAll();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível alterar a disponibilidade.',
      );
    } finally {
      setSavingId(null);
    }
  }

  const withPosition = useMemo(
    () => positions.filter((p) => p.latitude !== null && p.longitude !== null),
    [positions],
  );

  const recentCount = useMemo(
    () => withPosition.filter((p) => p.isLive).length,
    [withPosition],
  );

  const inRouteCount = useMemo(
    () => positions.filter((p) => p.deliveryStatus === 'IN_PROGRESS').length,
    [positions],
  );

  const pendingRouteCount = useMemo(
    () => positions.reduce((sum, p) => sum + (p.pendingDeliveries?.length ?? 0), 0),
    [positions],
  );

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] min-h-0 flex-col lg:h-[calc(100vh)] lg:flex-row">
      <div className="relative min-h-[45vh] flex-1 lg:min-h-0">
        <DelivererPositionsMap
          positions={positions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          fitPaddingRight={400}
        />
      </div>

      <aside className="flex h-[min(55vh,520px)] w-full shrink-0 flex-col border-t border-slate-200 bg-white shadow-xl lg:h-full lg:w-[min(100%,400px)] lg:max-w-md lg:border-l lg:border-t-0">
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
          {actionError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {actionError}
            </p>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900">Entregadores</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                {lastUpdated
                  ? `Atualizado às ${lastUpdated.toLocaleTimeString('pt-BR')}`
                  : 'Posições em tempo quase real'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setRefreshing(true);
                  loadAll().finally(() => setRefreshing(false));
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Atualizar"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
              <Link
                href={buildStoreHref(storeId, 'deliverers')}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Lista
              </Link>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center">
              <p className="text-lg font-bold text-slate-900">{positions.length}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">No painel</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-center">
              <p className="text-lg font-bold text-emerald-800">{recentCount}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">Ao vivo</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-center">
              <p className="text-lg font-bold text-amber-800">{inRouteCount}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700">Em rota</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5 text-center">
              <p className="text-lg font-bold text-orange-800">{pendingRouteCount}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-orange-700">Aguard. aceite</p>
            </div>
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {positions.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <MapPin className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Nenhum entregador no mapa</p>
              <p className="max-w-xs text-xs leading-relaxed text-slate-500">
                Entregadores indisponíveis ou sem GPS ativo. Peça para abrir o app, permitir
                localização &quot;o tempo todo&quot; e estar marcado como disponível no painel.
              </p>
              <p className="text-xs text-slate-400">Atualização automática a cada 15 segundos.</p>
            </li>
          )}
          {positions.map((p) => (
            <li key={p.delivererId}>
              <DelivererMapCard
                position={p}
                isSelected={selectedId === p.delivererId}
                isExpanded={expandedId === p.delivererId}
                onSelect={() => setSelectedId(p.delivererId)}
                onToggleExpand={() =>
                  setExpandedId((current) => (current === p.delivererId ? null : p.delivererId))
                }
                canToggleAvailability={canToggleAvailability}
                saving={savingId === p.delivererId}
                onToggleAvailability={(next) => setAvailability(p.delivererId, next)}
              />
            </li>
          ))}
        </ul>

        {canToggleAvailability && offlineDeliverers.length > 0 && (
          <div className="shrink-0 border-t border-slate-200">
            <h2 className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Indisponíveis ({offlineDeliverers.length})
            </h2>
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
              {offlineDeliverers.map((d) => (
                <li key={d.id}>
                  <DelivererOfflineCard
                    name={d.user.name}
                    saving={savingId === d.id}
                    onToggleAvailability={(next) => setAvailability(d.id, next)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
