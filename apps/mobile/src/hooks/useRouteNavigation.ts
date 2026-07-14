import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  decodePolyline,
  distanceToPolylineMeters,
  formatDistanceMeters,
  haversineDistanceMeters,
  type DeliveryRouteResponse,
  type DeliveryRouteStep,
  type LatLng,
} from '@gas-erp/shared';
import { fetchDeliveryRoute, logRouteDebug } from '../lib/routing';
import type { DriverPosition } from './useDriverLocation';

const REROUTE_DISTANCE_M = 60;
const REROUTE_DEBOUNCE_MS = 30_000;

export interface NextManeuver {
  instruction: string;
  maneuver?: string;
  distanceMeters: number;
  distanceLabel: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}

/**
 * Determina a próxima manobra a partir da posição do motorista.
 * O motorista está trafegando pelo passo mais próximo; a manobra a anunciar é
 * a do fim desse passo (início do próximo), com a distância até esse ponto.
 */
function computeNextManeuver(
  driver: LatLng,
  steps: DeliveryRouteStep[] | undefined,
): NextManeuver | null {
  if (!steps || steps.length === 0) return null;

  let currentIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = distanceToPolylineMeters(driver, [
      steps[i].startLocation,
      steps[i].endLocation,
    ]);
    if (d < bestDistance) {
      bestDistance = d;
      currentIndex = i;
    }
  }

  const currentStep = steps[currentIndex];
  const upcomingStep = steps[currentIndex + 1] ?? currentStep;
  const distanceMeters = haversineDistanceMeters(
    driver.latitude,
    driver.longitude,
    currentStep.endLocation.latitude,
    currentStep.endLocation.longitude,
  );

  return {
    instruction: upcomingStep.instruction,
    maneuver: upcomingStep.maneuver,
    distanceMeters,
    distanceLabel: formatDistanceMeters(distanceMeters),
  };
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
        const message = err instanceof Error ? err.message : 'Erro ao carregar rota';
        logRouteDebug('navigation_failed', { deliveryId, message });
        setError(message);
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

  const nextManeuver = useMemo(() => {
    if (!enabled || !driverPosition || !route?.steps) return null;
    return computeNextManeuver(driverPosition, route.steps);
  }, [enabled, driverPosition?.latitude, driverPosition?.longitude, route?.steps]);

  return {
    route,
    polyline,
    loading,
    error,
    etaLabel,
    distanceLabel,
    nextManeuver,
    refreshRoute: () => {
      if (driverPosition) void loadRoute(driverPosition, true);
    },
  };
}
