import { useCallback } from 'react';
import { fetchStoreRoute } from '../lib/routing';
import type { DriverPosition } from './useDriverLocation';
import { useRouteProgress } from './useRouteProgress';

/** Navegação nativa até a unidade (modo "voltar à base"). */
export function useStoreHomeNavigation(
  storeId: string | null,
  driverPosition: DriverPosition | null,
  enabled: boolean,
) {
  const fetchRoute = useCallback(
    (id: string, lat: number, lng: number) => fetchStoreRoute(id, lat, lng),
    [],
  );

  const mapError = useCallback(
    (raw: string) =>
      /Cannot GET|404/i.test(raw)
        ? 'Rota até a loja indisponível no servidor. Atualize a API (fly deploy) e tente de novo.'
        : raw,
    [],
  );

  return useRouteProgress({
    targetId: storeId,
    driverPosition,
    enabled,
    fetchRoute,
    mapError,
    debugTag: 'store_navigation_failed',
  });
}
