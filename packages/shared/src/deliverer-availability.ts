export function getDelivererAvailabilityLock(position: {
  delivererStatus?: string;
  deliveryStatus?: string | null;
  pendingDeliveries?: unknown[] | null;
}): { locked: boolean; reason: string | null } {
  if (position.deliveryStatus === 'IN_PROGRESS' || position.delivererStatus === 'ON_DELIVERY') {
    return { locked: true, reason: 'Bloqueado em rota' };
  }
  if ((position.pendingDeliveries?.length ?? 0) > 0) {
    return { locked: true, reason: 'Bloqueado: rota aguardando aceite' };
  }
  return { locked: false, reason: null };
}
