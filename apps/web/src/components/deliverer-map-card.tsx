'use client';

import {
  Battery,
  BatteryCharging,
  Bike,
  ChevronDown,
  MapPin,
  Navigation,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { RouteElapsed } from '@/components/route-elapsed';
import { PendingDeliveriesInfo } from '@/components/pending-deliveries-info';
import type { DelivererPosition } from '@gas-erp/shared';
import {
  DELIVERER_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  formatWaitTime,
  getDelivererPositionBadge,
  getElapsedWaitingSeconds,
} from '@gas-erp/shared';

type PendingDelivery = NonNullable<DelivererPosition['pendingDeliveries']>[number];

function formatShortTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function gpsStatusShort(p: DelivererPosition): { label: string; online: boolean; dotClass: string } {
  if (p.latitude === null || p.longitude === null) {
    return { label: 'Sem GPS', online: false, dotClass: 'bg-slate-300' };
  }
  if (p.stale) {
    return { label: `GPS ${formatShortTime(p.lastSeenAt)}`, online: false, dotClass: 'bg-rose-400' };
  }
  if (p.isLive) {
    return { label: 'GPS ao vivo', online: true, dotClass: 'bg-emerald-500' };
  }
  return { label: `GPS ${formatShortTime(p.lastSeenAt)}`, online: false, dotClass: 'bg-amber-400' };
}

function PendingSummary({ pendingDeliveries }: { pendingDeliveries: PendingDelivery[] }) {
  const count = pendingDeliveries.length;
  const minWait = Math.min(
    ...pendingDeliveries.map((d: PendingDelivery) => getElapsedWaitingSeconds(d.assignedAt)),
  );

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-800">
      {count} aguard. aceite · há {formatWaitTime(minWait)}
    </span>
  );
}

function BatteryInline({
  level,
  charging,
}: {
  level?: number | null;
  charging?: boolean | null;
}) {
  if (level == null) return null;
  const Icon = charging ? BatteryCharging : Battery;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {level}%
    </span>
  );
}

function AvailabilityToggle({
  available,
  locked,
  saving,
  compact,
  onToggle,
}: {
  available: boolean;
  locked: boolean;
  saving: boolean;
  compact?: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (locked) {
    return (
      <p className={`text-[11px] text-slate-500 ${compact ? '' : 'mt-2'}`}>
        Bloqueado em rota
      </p>
    );
  }

  return (
    <div
      className={`flex items-center ${compact ? 'shrink-0' : 'mt-2 justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {!compact && <span className="text-xs font-medium text-slate-700">Disponibilidade</span>}
      <button
        type="button"
        disabled={saving}
        onClick={() => onToggle(!available)}
        className={`rounded-md font-medium transition-colors disabled:opacity-50 ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        } ${
          available
            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
        }`}
        aria-pressed={available}
      >
        {saving ? '…' : available ? 'Disponível' : 'Indisponível'}
      </button>
    </div>
  );
}

function DelivererAvatar({ inRoute }: { inRoute: boolean }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        inRoute ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'
      }`}
    >
      <Bike className="h-4 w-4" aria-hidden />
    </div>
  );
}

export function DelivererMapCard({
  position: p,
  isSelected,
  onSelect,
  canToggleAvailability,
  saving,
  onToggleAvailability,
}: {
  position: DelivererPosition;
  isSelected: boolean;
  onSelect: () => void;
  canToggleAvailability: boolean;
  saving: boolean;
  onToggleAvailability: (next: boolean) => void;
}) {
  const badge = getDelivererPositionBadge(p);
  const gps = gpsStatusShort(p);
  const inRoute = p.deliveryStatus === 'IN_PROGRESS';
  const pendingCount = p.pendingDeliveries?.length ?? 0;
  const availabilityLocked = p.delivererStatus === 'ON_DELIVERY';
  const statusLabel = DELIVERER_STATUS_LABELS[p.delivererStatus] ?? p.delivererStatus;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-3 py-2.5 text-left transition-colors ${
        isSelected ? 'bg-orange-50 ring-1 ring-inset ring-orange-200' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex gap-2.5">
        <DelivererAvatar inRoute={inRoute} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold uppercase tracking-tight text-slate-900">
              {p.name}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${gps.dotClass}`} aria-hidden />
              <span className="text-[11px] font-medium text-slate-600">
                {gps.online ? 'Online' : 'Sem sinal'}
              </span>
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-0.5">
              <Navigation className="h-3 w-3 shrink-0" aria-hidden />
              {gps.label}
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-medium text-slate-600">{statusLabel}</span>
            <BatteryInline level={p.batteryLevel} charging={p.batteryCharging} />
          </div>

          {(inRoute || pendingCount > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {inRoute && (
                <div className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-amber-800">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate font-medium">{p.customerName ?? 'Cliente'}</span>
                  <RouteElapsed
                    startedAt={p.routeStartedAt}
                    inline
                    className="shrink-0 font-semibold text-amber-700"
                  />
                </div>
              )}
              {pendingCount > 0 && (
                <PendingSummary pendingDeliveries={p.pendingDeliveries!} />
              )}
            </div>
          )}

          {!inRoute && pendingCount === 0 && badge.key !== 'LIVE' && badge.key !== 'NO_GPS' && (
            <div className="mt-1">
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
          )}
        </div>

        {canToggleAvailability && !isSelected && (
          <AvailabilityToggle
            available={p.status !== 'OFFLINE'}
            locked={availabilityLocked}
            saving={saving}
            compact
            onToggle={onToggleAvailability}
          />
        )}

        {isSelected && (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        )}
      </div>

      {isSelected && (
        <div className="mt-2.5 border-t border-slate-100 pt-2.5 pl-[46px]">
          {inRoute && (
            <div className="space-y-1 text-xs text-slate-600">
              <p>
                Entrega: {DELIVERY_STATUS_LABELS[p.deliveryStatus!] ?? p.deliveryStatus}
              </p>
              {p.deliveryAddress && (
                <p className="line-clamp-3 text-slate-500">{p.deliveryAddress}</p>
              )}
            </div>
          )}

          {pendingCount > 0 && (
            <div className={inRoute ? 'mt-2' : ''}>
              <PendingDeliveriesInfo pendingDeliveries={p.pendingDeliveries!} compact />
            </div>
          )}

          {p.stores.length > 1 && (
            <p className="mt-2 text-[11px] text-slate-400">
              Unidades: {p.stores.map((s) => s.name).join(', ')}
            </p>
          )}

          {canToggleAvailability && (
            <AvailabilityToggle
              available={p.status !== 'OFFLINE'}
              locked={availabilityLocked}
              saving={saving}
              onToggle={onToggleAvailability}
            />
          )}
        </div>
      )}
    </button>
  );
}

export function DelivererOfflineCard({
  name,
  saving,
  onToggleAvailability,
}: {
  name: string;
  saving: boolean;
  onToggleAvailability: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <DelivererAvatar inRoute={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold uppercase tracking-tight text-slate-700">
          {name}
        </p>
        <div className="mt-0.5 flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden />
          <span className="text-[11px] text-slate-500">Indisponível · fora do mapa</span>
        </div>
      </div>
      <AvailabilityToggle
        available={false}
        locked={false}
        saving={saving}
        compact
        onToggle={onToggleAvailability}
      />
    </div>
  );
}
