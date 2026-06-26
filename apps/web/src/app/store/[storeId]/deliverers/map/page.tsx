'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, RefreshCw } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { Badge, Card, PageHeader } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import { buildStoreHref } from '@/lib/store-nav';
import type { AuthUser, DelivererPosition } from '@gas-erp/shared';
import {
  canManageDeliverers,
  DELIVERER_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  getDelivererPositionBadge,
} from '@gas-erp/shared';

const REFRESH_INTERVAL_MS = 20_000;

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
      <div className="flex h-[420px] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
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

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Mapa de entregadores"
        subtitle={
          lastUpdated
            ? `${recentCount} ao vivo · atualizado às ${lastUpdated.toLocaleTimeString('pt-BR')}`
            : 'Posições em tempo quase real'
        }
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                loadAll().finally(() => setRefreshing(false));
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

      {withPosition.length === 0 && positions.length === 0 && offlineDeliverers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <MapPin className="h-10 w-10 text-slate-300" />
          <p className="text-lg font-medium text-slate-700">Nenhum entregador com posição no mapa</p>
          <p className="max-w-md text-sm text-slate-500">
            As posições aparecem quando um entregador está logado no app mobile com GPS ativo.
            A atualização automática ocorre a cada 20 segundos.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden p-0">
            {withPosition.length === 0 ? (
              <div className="flex h-[420px] flex-col items-center justify-center gap-2 px-6 text-center">
                <MapPin className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">Nenhuma posição no mapa</p>
                <p className="max-w-sm text-xs text-slate-500">
                  Entregadores indisponíveis ou sem GPS não aparecem no mapa.
                </p>
              </div>
            ) : (
              <DelivererPositionsMap
                positions={positions}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </Card>

          <Card className="flex max-h-[560px] flex-col">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
              No mapa ({positions.length})
            </h2>
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {positions.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-400">
                  Nenhum entregador disponível no mapa.
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
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                      {p.deliveryStatus && (
                        <p className="mt-1 text-xs text-slate-600">
                          Entrega: {DELIVERY_STATUS_LABELS[p.deliveryStatus] ?? p.deliveryStatus}
                        </p>
                      )}
                      {p.customerName && (
                        <p className="mt-1 text-xs text-slate-600">Cliente: {p.customerName}</p>
                      )}
                      {p.deliveryAddress && (
                        <p className="mt-0.5 text-xs text-slate-500">{p.deliveryAddress}</p>
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
              <>
                <h2 className="border-y border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
                  Indisponíveis ({offlineDeliverers.length})
                </h2>
                <ul className="divide-y divide-slate-100 overflow-y-auto">
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
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
