import { useCallback } from 'react';
import { fetchDeliveryRoute } from '../lib/routing';
import type { DriverPosition } from './useDriverLocation';
import { useRouteProgress } from './useRouteProgress';

export type { NextManeuver } from './useRouteProgress';

/** Navegação até o cliente. O núcleo (ETA vivo, reroute, manobras) é compartilhado. */
export function useRouteNavigation(
  deliveryId: string | null,
  driverPosition: DriverPosition | null,
  enabled: boolean,
) {
  const fetchRoute = useCallback(
    (id: string, lat: number, lng: number) => fetchDeliveryRoute(id, lat, lng),
    [],
  );

  return useRouteProgress({
    targetId: deliveryId,
    driverPosition,
    enabled,
    fetchRoute,
    debugTag: 'navigation_failed',
  });
}
