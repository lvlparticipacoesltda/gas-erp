import { useEffect, useRef, useState } from 'react';
import {
  decodePolyline,
  formatDistanceMeters,
  type DeliveryRouteResponse,
  type LatLng,
} from '@gas-erp/shared';
import { fetchDeliveryRoute, logRouteDebug } from '../lib/routing';
import type { DriverPosition } from './useDriverLocation';

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}

export function useRoutePreview(
  deliveryId: string | null,
  driverPosition: DriverPosition | null,
  enabled: boolean,
) {
  const [route, setRoute] = useState<DeliveryRouteResponse | null>(null);
  const [polyline, setPolyline] = useState<LatLng[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    fetchedForRef.current = null;
    setRoute(null);
    setPolyline([]);
    setError(null);
    setLoading(false);
  }, [deliveryId]);

  useEffect(() => {
    if (!enabled) {
      fetchedForRef.current = null;
      setRoute(null);
      setPolyline([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!deliveryId || !driverPosition) return;
    if (fetchedForRef.current === deliveryId) return;

    let cancelled = false;
    fetchedForRef.current = deliveryId;
    setLoading(true);
    setError(null);

    void fetchDeliveryRoute(
      deliveryId,
      driverPosition.latitude,
      driverPosition.longitude,
    )
      .then((result) => {
        if (cancelled) return;
        setRoute(result);
        setPolyline(decodePolyline(result.encodedPolyline));
      })
      .catch((err) => {
        if (cancelled) return;
        fetchedForRef.current = null;
        const message = err instanceof Error ? err.message : 'Erro ao carregar rota';
        logRouteDebug('preview_failed', { deliveryId, message });
        setError(message);
        setRoute(null);
        setPolyline([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, deliveryId, driverPosition]);

  return {
    polyline,
    loading,
    error,
    etaLabel: route ? formatDuration(route.durationSeconds) : null,
    distanceLabel: route ? formatDistanceMeters(route.distanceMeters) : null,
  };
}
