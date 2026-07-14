import { useEffect, useMemo, useRef, useState } from 'react';
import { decodePolyline, type LatLng } from '@gas-erp/shared';
import { fetchDeliveryRoute } from '../lib/routing';
import type { DriverPosition } from './useDriverLocation';
import type { Delivery, DeliveryDestination } from '../types';

/** Busca o fim da rota (Directions) quando o geocoding da API não trouxe destination. */
export function useEnrichedDeliveryDestinations(
  deliveries: Delivery[],
  driverPosition: DriverPosition | null,
) {
  const [routeEnds, setRouteEnds] = useState<Record<string, DeliveryDestination>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!driverPosition) return;

    for (const delivery of deliveries) {
      if (delivery.destination) continue;
      if (fetchedRef.current.has(delivery.id)) continue;
      fetchedRef.current.add(delivery.id);

      void fetchDeliveryRoute(
        delivery.id,
        driverPosition.latitude,
        driverPosition.longitude,
      )
        .then((result) => {
          const points = decodePolyline(result.encodedPolyline);
          const end = points[points.length - 1];
          if (!end) return;
          setRouteEnds((prev) => ({ ...prev, [delivery.id]: end }));
        })
        .catch(() => {
          fetchedRef.current.delete(delivery.id);
        });
    }
  }, [deliveries, driverPosition]);

  return useMemo(
    () =>
      deliveries.map((delivery) => ({
        ...delivery,
        destination: delivery.destination ?? routeEnds[delivery.id] ?? null,
      })),
    [deliveries, routeEnds],
  );
}

export function collectDeliveryCoordinates(
  deliveries: Delivery[],
  extraCoordinates: Record<string, LatLng> = {},
  activeDeliveryId?: string | null,
  selectedDeliveryId?: string | null,
  activeRouteEnd?: LatLng | null,
  previewRouteEnd?: LatLng | null,
): LatLng[] {
  const coords: LatLng[] = [];

  for (const delivery of deliveries) {
    let point: LatLng | null = null;
    if (delivery.id === activeDeliveryId && activeRouteEnd) point = activeRouteEnd;
    else if (delivery.id === selectedDeliveryId && previewRouteEnd) point = previewRouteEnd;
    else point = delivery.destination ?? extraCoordinates[delivery.id] ?? null;

    if (point) coords.push(point);
  }

  return coords;
}
