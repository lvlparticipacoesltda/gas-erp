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
import { fetchStoreRoute, logRouteDebug } from '../lib/routing';
import type { DriverPosition } from './useDriverLocation';
import type { NextManeuver } from './useRouteNavigation';

const REROUTE_DISTANCE_M = 60;
const REROUTE_DEBOUNCE_MS = 30_000;

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}

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

/** Navegação nativa até a unidade (modo “voltar à base”). */
export function useStoreHomeNavigation(
  storeId: string | null,
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
  const prevStoreIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (storeId !== prevStoreIdRef.current) {
      prevStoreIdRef.current = storeId;
      initialLoadedRef.current = false;
      setRoute(null);
      setPolyline([]);
      setError(null);
    }
  }, [storeId]);

  const loadRoute = useCallback(
    async (origin: DriverPosition, force = false) => {
      if (!storeId || fetchingRef.current) return;
      if (!force && Date.now() - lastRerouteAt.current < REROUTE_DEBOUNCE_MS) return;

      fetchingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchStoreRoute(
          storeId,
          origin.latitude,
          origin.longitude,
        );
        setRoute(result);
        setPolyline(decodePolyline(result.encodedPolyline));
        lastRerouteAt.current = Date.now();
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Erro ao carregar rota até a loja';
        const message =
          /Cannot GET|404/i.test(raw)
            ? 'Rota até a loja indisponível no servidor. Atualize a API (fly deploy) e tente de novo.'
            : raw;
        logRouteDebug('store_navigation_failed', { storeId, message: raw });
        setError(message);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [storeId],
  );

  useEffect(() => {
    if (!enabled || !storeId || !driverPosition || initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    void loadRoute(driverPosition, true);
  }, [enabled, storeId, driverPosition, loadRoute]);

  useEffect(() => {
    if (!enabled || !storeId || !driverPosition || polyline.length < 2) return;

    const dist = distanceToPolylineMeters(driverPosition, polyline);
    if (dist > REROUTE_DISTANCE_M) {
      void loadRoute(driverPosition);
    }
  }, [
    enabled,
    storeId,
    driverPosition?.latitude,
    driverPosition?.longitude,
    polyline,
    loadRoute,
  ]);

  const nextManeuver = useMemo(() => {
    if (!enabled || !driverPosition || !route?.steps) return null;
    return computeNextManeuver(driverPosition, route.steps);
  }, [enabled, driverPosition?.latitude, driverPosition?.longitude, route?.steps]);

  return {
    polyline,
    loading,
    error,
    etaLabel: route ? formatDuration(route.durationSeconds) : null,
    distanceLabel: route ? formatDistanceMeters(route.distanceMeters) : null,
    nextManeuver,
  };
}
