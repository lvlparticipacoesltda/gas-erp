'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { DelivererPosition } from '@gas-erp/shared';
import {
  DELIVERER_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  getDelivererPositionBadge,
} from '@gas-erp/shared';
import { RouteElapsed } from '@/components/route-elapsed';
import { PendingDeliveriesInfo } from '@/components/pending-deliveries-info';
import {
  createDelivererMapIcon,
  delivererMarkerAccent,
} from '@/components/deliverer-map-marker-icon';
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

function positionsWithCoords(positions: DelivererPosition[]) {
  return positions.filter(
    (p) => p.latitude !== null && p.longitude !== null,
  ) as Array<DelivererPosition & { latitude: number; longitude: number }>;
}

/** Ajusta o viewport só na carga inicial; não interfere após o usuário mover/zoomar. */
function MapViewportController({
  positions,
  selectedId,
  paddingRight = 80,
}: {
  positions: DelivererPosition[];
  selectedId: string | null;
  paddingRight?: number;
}) {
  const map = useMap();
  const initialFitDone = useRef(false);
  const userInteracted = useRef(false);
  const prevSelectedId = useRef<string | null>(null);

  useEffect(() => {
    const markInteracted = () => {
      userInteracted.current = true;
    };
    map.on('dragstart', markInteracted);
    map.on('zoomstart', markInteracted);
    return () => {
      map.off('dragstart', markInteracted);
      map.off('zoomstart', markInteracted);
    };
  }, [map]);

  useEffect(() => {
    if (initialFitDone.current || userInteracted.current) return;

    const withCoords = positionsWithCoords(positions);
    if (withCoords.length === 0) return;

    const pad = { top: 64, right: paddingRight, bottom: 64, left: 64 };
    if (withCoords.length === 1) {
      map.setView([withCoords[0].latitude, withCoords[0].longitude], 15);
    } else {
      const bounds = L.latLngBounds(withCoords.map((p) => [p.latitude, p.longitude]));
      map.fitBounds(bounds, {
        paddingTopLeft: L.point(pad.left, pad.top),
        paddingBottomRight: L.point(pad.right, pad.bottom),
        maxZoom: 15,
      });
    }
    initialFitDone.current = true;
  }, [map, positions, paddingRight]);

  useEffect(() => {
    if (selectedId === prevSelectedId.current) return;
    prevSelectedId.current = selectedId;

    if (!selectedId) return;

    const selected = positionsWithCoords(positions).find((p) => p.delivererId === selectedId);
    if (!selected) return;

    map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 14), {
      duration: 0.4,
    });
  }, [map, selectedId, positions]);

  return null;
}

export function DelivererPositionsMap({
  positions,
  selectedId,
  onSelect,
  fitPaddingRight = 80,
}: {
  positions: DelivererPosition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fitPaddingRight?: number;
}) {
  const withCoords = positionsWithCoords(positions);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapViewportController
        positions={positions}
        selectedId={selectedId}
        paddingRight={fitPaddingRight}
      />
      {withCoords.map((p) => {
        const isSelected = selectedId === p.delivererId;
        const badge = getDelivererPositionBadge(p);
        const icon = createDelivererMapIcon({
          accent: delivererMarkerAccent(p),
          isSelected,
          isLive: p.isLive,
          stale: p.stale,
        });
        return (
          <Marker
            key={p.delivererId}
            position={[p.latitude, p.longitude]}
            icon={icon}
            zIndexOffset={isSelected ? 1000 : p.isLive ? 500 : 0}
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
                {p.deliveryStatus === 'IN_PROGRESS' && (
                  <>
                    <p className="text-slate-600">
                      Entrega: {DELIVERY_STATUS_LABELS[p.deliveryStatus] ?? p.deliveryStatus}
                    </p>
                    <RouteElapsed startedAt={p.routeStartedAt} className="text-sm font-semibold text-amber-700" />
                    {p.customerName && (
                      <p className="text-slate-600">Cliente: {p.customerName}</p>
                    )}
                    {p.deliveryAddress && (
                      <p className="text-slate-500">{p.deliveryAddress}</p>
                    )}
                  </>
                )}
                {(p.pendingDeliveries?.length ?? 0) > 0 && (
                  <div className="mt-2">
                    <PendingDeliveriesInfo pendingDeliveries={p.pendingDeliveries!} compact />
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Registrado: {formatTime(p.lastSeenAt)}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
