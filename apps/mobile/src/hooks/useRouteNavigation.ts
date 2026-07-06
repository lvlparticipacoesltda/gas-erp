import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decodePolyline,
  distanceToPolylineMeters,
  formatDistanceMeters,
  type DeliveryRouteResponse,
  type LatLng,
} from '@gas-erp/shared';
import { fetchDeliveryRoute } from '../lib/routing';
import type { DriverPosition } from './useDriverLocation';

const REROUTE_DISTANCE_M = 60;
const REROUTE_DEBOUNCE_MS = 30_000;

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}

export function useRouteNavigation(
  deliveryId: string | null,
  driverPosition: DriverPosition | null,
  enabled: boolean,
) {
  const [route, setRoute] = useState<DeliveryRouteResponse | null>(null);
  const [polyline, setPolyline] = useState<LatLng[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRerouteAt = useRef(0);
  const fetchingRef = useRef(false);
  const initialLoadedRef = useRef(false);
  const prevDeliveryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (deliveryId !== prevDeliveryIdRef.current) {
      prevDeliveryIdRef.current = deliveryId;
      initialLoadedRef.current = false;
      setRoute(null);
      setPolyline([]);
      setError(null);
    }
  }, [deliveryId]);

  const loadRoute = useCallback(
    async (origin: DriverPosition, force = false) => {
      if (!deliveryId || fetchingRef.current) return;
      if (!force && Date.now() - lastRerouteAt.current < REROUTE_DEBOUNCE_MS) return;

      fetchingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchDeliveryRoute(
          deliveryId,
          origin.latitude,
          origin.longitude,
        );
        setRoute(result);
        setPolyline(decodePolyline(result.encodedPolyline));
        lastRerouteAt.current = Date.now();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar rota');
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [deliveryId],
  );

  useEffect(() => {
    if (!enabled || !deliveryId || !driverPosition || initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    void loadRoute(driverPosition, true);
  }, [enabled, deliveryId, driverPosition, loadRoute]);

  useEffect(() => {
    if (!enabled || !deliveryId || !driverPosition || polyline.length < 2) return;

    const dist = distanceToPolylineMeters(driverPosition, polyline);
    if (dist > REROUTE_DISTANCE_M) {
      void loadRoute(driverPosition);
    }
  }, [
    enabled,
    deliveryId,
    driverPosition?.latitude,
    driverPosition?.longitude,
    polyline,
    loadRoute,
  ]);

  const etaLabel = route ? formatDuration(route.durationSeconds) : null;
  const distanceLabel = route ? formatDistanceMeters(route.distanceMeters) : null;

  return {
    route,
    polyline,
    loading,
    error,
    etaLabel,
    distanceLabel,
    refreshRoute: () => {
      if (driverPosition) void loadRoute(driverPosition, true);
    },
  };
}
