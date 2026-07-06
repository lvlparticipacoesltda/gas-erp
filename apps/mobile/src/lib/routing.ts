import type { DeliveryRouteResponse } from '@gas-erp/shared';
import { api } from './api';

export function fetchDeliveryRoute(
  deliveryId: string,
  originLat: number,
  originLng: number,
): Promise<DeliveryRouteResponse> {
  const params = new URLSearchParams({
    originLat: String(originLat),
    originLng: String(originLng),
  });
  return api<DeliveryRouteResponse>(`/deliveries/${deliveryId}/route?${params.toString()}`);
}
