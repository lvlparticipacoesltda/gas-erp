import { useEffect, useMemo, useState } from 'react';
import { formatDistanceMeters, haversineDistanceMeters } from '@gas-erp/shared';
import type { DriverPosition } from '../hooks/useDriverLocation';
import type { Delivery, DeliveryDestination } from '../types';

/** Raio para liberar "Concluir entrega" — padrão de apps de entrega (~500 m). */
export const DELIVERY_FINISH_RADIUS_METERS = 500;

function resolveDestinationCoords(
  delivery: Delivery | null,
  routeDestination: DeliveryDestination | null | undefined,
): DeliveryDestination | null {
  if (delivery?.destination) return delivery.destination;
  if (routeDestination) return routeDestination;
  return null;
}

export function useDeliveryFinishProximity(
  delivery: Delivery | null,
  driverPosition: DriverPosition | null,
  routeDestination?: DeliveryDestination | null,
) {
  const [unlockedDeliveryIds, setUnlockedDeliveryIds] = useState<Set<string>>(() => new Set());

  const destinationCoords = useMemo(
    () => resolveDestinationCoords(delivery, routeDestination),
    [delivery?.destination, delivery?.id, routeDestination],
  );

  const distanceToDestination = useMemo(() => {
    if (!destinationCoords || !driverPosition) return null;
    return haversineDistanceMeters(
      driverPosition.latitude,
      driverPosition.longitude,
      destinationCoords.latitude,
      destinationCoords.longitude,
    );
  }, [destinationCoords, driverPosition]);

  useEffect(() => {
    if (!delivery?.id || distanceToDestination == null) return;
    if (distanceToDestination > DELIVERY_FINISH_RADIUS_METERS) return;

    setUnlockedDeliveryIds((prev) => {
      if (prev.has(delivery.id)) return prev;
      const next = new Set(prev);
      next.add(delivery.id);
      return next;
    });
  }, [delivery?.id, distanceToDestination]);

  const canFinish = useMemo(() => {
    if (!delivery) return false;
    if (!destinationCoords) return false;
    if (!driverPosition) return false;
    if (unlockedDeliveryIds.has(delivery.id)) return true;
    if (
      distanceToDestination != null
      && distanceToDestination <= DELIVERY_FINISH_RADIUS_METERS
    ) {
      return true;
    }
    return false;
  }, [
    delivery,
    destinationCoords,
    driverPosition,
    unlockedDeliveryIds,
    distanceToDestination,
  ]);

  const finishHint = useMemo(() => {
    if (canFinish || !delivery) return null;
    if (!destinationCoords) {
      return 'Aguardando localização do endereço no mapa...';
    }
    if (!driverPosition) {
      return 'Aguardando sua localização para liberar a conclusão.';
    }
    return `Aproxime-se do cliente (${formatDistanceMeters(distanceToDestination ?? 0)} restantes).`;
  }, [canFinish, delivery, destinationCoords, driverPosition, distanceToDestination]);

  return { canFinish, distanceToDestination, finishHint };
}
