import type { DeliveryRouteResponse } from '@gas-erp/shared';
import { ApiError, api } from './api';

export function logRouteDebug(
  phase: string,
  detail: Record<string, unknown>,
) {
  if (__DEV__) {
    console.log(`[Route] ${phase}`, detail);
  }
}

export function fetchDeliveryRoute(
  deliveryId: string,
  originLat: number,
  originLng: number,
): Promise<DeliveryRouteResponse> {
  const params = new URLSearchParams({
    originLat: String(originLat),
    originLng: String(originLng),
  });
  const path = `/deliveries/${deliveryId}/route?${params.toString()}`;

  logRouteDebug('request', { deliveryId, originLat, originLng, path });

  return api<DeliveryRouteResponse>(path).catch((error) => {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Erro ao carregar rota';
    const status = error instanceof ApiError ? error.status : undefined;

    logRouteDebug('error', {
      deliveryId,
      originLat,
      originLng,
      status,
      message,
    });

    throw error instanceof Error ? error : new Error(message);
  });
}
