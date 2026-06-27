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

/** Entregador pode receber nova rota na tela de vendas. */
export function isDelivererAssignableForSale(deliverer: {
  status: string;
  user?: { active?: boolean };
  pendingDeliveryCount?: number;
}): { assignable: boolean; reason: string | null } {
  if (deliverer.user?.active === false) {
    return { assignable: false, reason: 'Inativo' };
  }
  if (deliverer.status === 'OFFLINE') {
    return { assignable: false, reason: 'Indisponível' };
  }
  if (deliverer.status === 'ON_DELIVERY') {
    return { assignable: false, reason: 'Em rota' };
  }
  if ((deliverer.pendingDeliveryCount ?? 0) > 0) {
    return { assignable: false, reason: 'Aguardando aceite de rota' };
  }
  return { assignable: true, reason: null };
}
