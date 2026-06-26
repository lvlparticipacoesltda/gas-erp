'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, RefreshCw } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { Badge } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import { RouteElapsed } from '@/components/route-elapsed';
import { buildStoreHref } from '@/lib/store-nav';
import type { AuthUser, DelivererPosition } from '@gas-erp/shared';
import {
  canManageDeliverers,
  DELIVERER_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  getDelivererPositionBadge,
} from '@gas-erp/shared';

const REFRESH_INTERVAL_MS = 15_000;

interface DelivererListItem {
  id: string;
  status: string;
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

function BatteryInfo({
  level,
  charging,
}: {
  level?: number | null;
  charging?: boolean | null;
}) {
  if (level == null) return null;
  return (
    <p className="mt-1 text-xs text-slate-500">
      🔋 {level}%{charging ? ' · carregando' : ''}
    </p>
  );
}

function positionStatusLabel(p: DelivererPosition): string {
  if (p.stale) return `Desatualizado · ${formatTime(p.lastSeenAt)}`;
  if (p.isLive) return 'Ao vivo';
  return `Última posição · ${formatTime(p.lastSeenAt)}`;
}

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

function AvailabilityToggle({
  available,
  locked,
  saving,
  onToggle,
}: {
  available: boolean;
  locked: boolean;
  saving: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (locked) {
    return (
      <p className="mt-2 text-xs text-slate-500">
        Disponibilidade bloqueada enquanto houver entrega em rota.
      </p>
    );
  }

  return (
    <div
      className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs font-medium text-slate-700">Disponibilidade</span>
      <button
        type="button"
        disabled={saving}
        onClick={() => onToggle(!available)}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          available
            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
        }`}
        aria-pressed={available}
      >
        {saving ? 'Salvando…' : available ? 'Disponível' : 'Indisponível'}
      </button>
    </div>
  );
}

export default function DelivererMapPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [positions, setPositions] = useState<DelivererPosition[]>([]);
  const [offlineDeliverers, setOfflineDeliverers] = useState<DelivererListItem[]>([]);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [canManage] = useState(() => {
    const user = getStoredUser<AuthUser>();
    return user ? canManageDeliverers(user.role) : false;
  });
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<DelivererPosition[]>(
      `/deliverers/positions?storeId=${storeId}`,
      {},
      getToken(),
    );
    setPositions(data);
    setLastUpdated(new Date());
  }, [storeId]);

  const loadOffline = useCallback(async () => {
    const all = await api<DelivererListItem[]>(`/deliverers?storeId=${storeId}`, {}, getToken());
    setOfflineDeliverers(
      all.filter((d) => d.user.active && d.status === 'OFFLINE'),
    );
  }, [storeId]);

  const loadAll = useCallback(async () => {
    await load();
    if (canManage) {
      await loadOffline().catch(() => setOfflineDeliverers([]));
    }
  }, [load, loadOffline, canManage]);

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
      const name = deliverer?.name ?? offlineDeliverers.find((d) => d.id === delivererId)?.user.name;
      const ok = confirm(
        `Marcar ${name ?? 'entregador'} como indisponível?\n\nEle deixará de aparecer no mapa até ser reativado.`,
      );
      if (!ok) return;
    }

    setSavingId(delivererId);
    try {
      await api(
        `/deliverers/${delivererId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: available ? 'AVAILABLE' : 'OFFLINE' }),
        },
        getToken(),
      );
      if (selectedId === delivererId && !available) {
        setSelectedId(null);
      }
      await loadAll();
    } catch {
      // api() already surfaces errors to the user when applicable
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

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] min-h-0 flex-col lg:h-[calc(100vh)] lg:flex-row">
      {/* Mapa em tela cheia (área à esquerda) */}
      <div className="relative min-h-[45vh] flex-1 lg:min-h-0">
        <DelivererPositionsMap
          positions={positions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          fitPaddingRight={400}
        />

        {withPosition.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
            <div className="rounded-lg border border-slate-200 bg-white/95 px-4 py-2 text-center text-sm text-slate-600 shadow-md backdrop-blur-sm">
              {positions.length === 0
                ? 'Nenhum entregador disponível no mapa. Peça ao entregador para permitir localização "o tempo todo" no app.'
                : 'Nenhuma posição GPS no momento — entregadores sem sinal ou indisponíveis.'}
            </div>
          </div>
        )}
      </div>

      {/* Painel lateral direito */}
      <aside className="flex h-[min(55vh,520px)] w-full shrink-0 flex-col border-t border-slate-200 bg-white shadow-xl lg:h-full lg:w-[min(100%,400px)] lg:max-w-md lg:border-l lg:border-t-0">
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
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

          <div className="mt-3 grid grid-cols-3 gap-2">
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
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {positions.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <MapPin className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Nenhum entregador no mapa</p>
              <p className="text-xs text-slate-400">
                Atualização automática a cada 20 segundos.
              </p>
            </li>
          )}
          {positions.map((p) => {
            const hasCoords = p.latitude !== null && p.longitude !== null;
            const isSelected = selectedId === p.delivererId;
            const badge = getDelivererPositionBadge(p);
            const availabilityLocked = p.delivererStatus === 'ON_DELIVERY';
            return (
              <li key={p.delivererId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.delivererId)}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    isSelected ? 'bg-orange-50 ring-1 ring-inset ring-orange-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {DELIVERER_STATUS_LABELS[p.delivererStatus] ?? p.delivererStatus}
                      </p>
                    </div>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                  {p.deliveryStatus && (
                    <p className="mt-1.5 text-xs text-slate-600">
                      Entrega: {DELIVERY_STATUS_LABELS[p.deliveryStatus] ?? p.deliveryStatus}
                    </p>
                  )}
                  <RouteElapsed startedAt={p.routeStartedAt} />
                  {p.customerName && (
                    <p className="mt-1 text-xs text-slate-600">Cliente: {p.customerName}</p>
                  )}
                  {p.deliveryAddress && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.deliveryAddress}</p>
                  )}
                  {hasCoords && (
                    <p className="mt-1 text-xs text-slate-500">{positionStatusLabel(p)}</p>
                  )}
                  <BatteryInfo level={p.batteryLevel} charging={p.batteryCharging} />
                  {p.stores.length > 1 && (
                    <p className="mt-1 text-xs text-slate-400">
                      Unidades: {p.stores.map((s) => s.name).join(', ')}
                    </p>
                  )}
                  {canManage && (
                    <AvailabilityToggle
                      available={p.status !== 'OFFLINE'}
                      locked={availabilityLocked}
                      saving={savingId === p.delivererId}
                      onToggle={(next) => setAvailability(p.delivererId, next)}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {canManage && offlineDeliverers.length > 0 && (
          <div className="shrink-0 border-t border-slate-200">
            <h2 className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Indisponíveis ({offlineDeliverers.length})
            </h2>
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
              {offlineDeliverers.map((d) => (
                <li key={d.id} className="px-4 py-3">
                  <p className="font-medium text-slate-900">{d.user.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Não exibido no mapa</p>
                  <AvailabilityToggle
                    available={false}
                    locked={false}
                    saving={savingId === d.id}
                    onToggle={(next) => setAvailability(d.id, next)}
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
