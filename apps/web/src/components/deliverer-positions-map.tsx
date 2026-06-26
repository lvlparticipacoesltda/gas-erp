'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { DelivererPosition } from '@gas-erp/shared';
import {
  DELIVERER_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  getDelivererPositionBadge,
} from '@gas-erp/shared';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: L.LatLngExpression = [-23.5505, -46.6333];
const DEFAULT_ZOOM = 12;

function formatTime(iso: string | null): string {
  if (!iso) return 'Sem registro';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function markerColor(p: DelivererPosition): string {
  if (p.stale) return '#94a3b8';
  if (p.isLive) return '#f97316';
  return '#3b82f6';
}

function positionStatusLabel(p: DelivererPosition): string {
  if (p.stale) return `Desatualizado: ${formatTime(p.lastSeenAt)}`;
  if (p.isLive) return 'Ao vivo';
  return `Última posição: ${formatTimeShort(p.lastSeenAt)}`;
}

function BatteryInfo({
  level,
  charging,
}: {
  level?: number | null;
  charging?: boolean | null;
}) {
  if (level == null) return null;
  return (
    <p className="mt-1 text-xs text-slate-600">
      🔋 {level}%
      {charging ? ' (carregando)' : ''}
    </p>
  );
}

function FitBounds({ positions }: { positions: DelivererPosition[] }) {
  const map = useMap();
  const withCoords = positions.filter(
    (p) => p.latitude !== null && p.longitude !== null,
  ) as Array<DelivererPosition & { latitude: number; longitude: number }>;

  useEffect(() => {
    if (withCoords.length === 0) return;
    if (withCoords.length === 1) {
      map.setView([withCoords[0].latitude, withCoords[0].longitude], 15);
      return;
    }
    const bounds = L.latLngBounds(withCoords.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
  }, [map, withCoords]);

  return null;
}

export function DelivererPositionsMap({
  positions,
  selectedId,
  onSelect,
}: {
  positions: DelivererPosition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const withCoords = positions.filter(
    (p) => p.latitude !== null && p.longitude !== null,
  ) as Array<DelivererPosition & { latitude: number; longitude: number }>;

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full min-h-[420px] w-full rounded-xl"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds positions={positions} />
      {withCoords.map((p) => {
        const isSelected = selectedId === p.delivererId;
        const color = markerColor(p);
        const badge = getDelivererPositionBadge(p);
        return (
          <CircleMarker
            key={p.delivererId}
            center={[p.latitude, p.longitude]}
            radius={isSelected ? 14 : p.isLive ? 12 : 10}
            pathOptions={{
              color: isSelected ? '#1d4ed8' : color,
              fillColor: color,
              fillOpacity: p.isLive ? 1 : 0.85,
              weight: isSelected ? 3 : p.isLive ? 3 : 2,
              className: p.isLive ? 'deliverer-marker-live' : undefined,
            }}
            eventHandlers={{
              click: () => onSelect(p.delivererId),
            }}
          >
            <Popup>
              <div className="min-w-[180px] text-sm">
                <p className="font-semibold text-slate-900">{p.name}</p>
                <p className="mt-1 text-slate-600">{badge.label}</p>
                <p className="text-slate-600">{positionStatusLabel(p)}</p>
                <BatteryInfo level={p.batteryLevel} charging={p.batteryCharging} />
                <p className="mt-1 text-slate-600">
                  {DELIVERER_STATUS_LABELS[p.delivererStatus] ?? p.delivererStatus}
                </p>
                {p.deliveryStatus && (
                  <p className="text-slate-600">
                    Entrega: {DELIVERY_STATUS_LABELS[p.deliveryStatus] ?? p.deliveryStatus}
                  </p>
                )}
                {p.customerName && (
                  <p className="text-slate-600">Cliente: {p.customerName}</p>
                )}
                {p.deliveryAddress && (
                  <p className="text-slate-500">{p.deliveryAddress}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Registrado: {formatTime(p.lastSeenAt)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
