import { useEffect, useMemo, useState } from 'react';
import { formatDistanceMeters, haversineDistanceMeters } from '@gas-erp/shared';
import type { DriverPosition } from '../hooks/useDriverLocation';
import type { Delivery, DeliveryDestination } from '../types';

/** Raio em que a conclusão é liberada sem confirmação extra (~1 km). */
export const DELIVERY_FINISH_RADIUS_METERS = 1000;

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

  /** Dentro do raio (ou já desbloqueado antes) — conclui sem alerta de distância. */
  const isNearDestination = useMemo(() => {
    if (!delivery) return false;
    if (unlockedDeliveryIds.has(delivery.id)) return true;
    return (
      distanceToDestination != null
      && distanceToDestination <= DELIVERY_FINISH_RADIUS_METERS
    );
  }, [delivery, unlockedDeliveryIds, distanceToDestination]);

  /**
   * Sempre permite concluir em rota ativa.
   * Antes, o botão ficava desabilitado fora do raio / sem GPS / sem destino —
   * comum no iOS ao navegar no Maps/Waze (GPS congela) ou com geocode falho.
   */
  const canFinish = Boolean(delivery);

  const needsConfirmAway = Boolean(delivery) && !isNearDestination;

  const finishHint = useMemo(() => {
    if (!delivery || isNearDestination) return null;
    if (!destinationCoords) {
      return 'Endereço sem ponto no mapa — você pode concluir mesmo assim.';
    }
    if (!driverPosition) {
      return 'Sem GPS no momento — volte ao app perto do cliente ou conclua mesmo assim.';
    }
    return `Você parece longe do cliente (${formatDistanceMeters(distanceToDestination ?? 0)}). Pode concluir mesmo assim.`;
  }, [
    delivery,
    isNearDestination,
    destinationCoords,
    driverPosition,
    distanceToDestination,
  ]);

  return {
    canFinish,
    needsConfirmAway,
    distanceToDestination,
    finishHint,
  };
}
