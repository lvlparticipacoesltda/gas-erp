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

/**
 * Situação do cartão de ponto do dia usada para liberar rotas ao entregador.
 *
 * Só `CLOCKED_IN` recebe entrega: sem ENT.1 ele nem começou o expediente, e
 * depois de SAÍ.1 precisa bater ENT.2 (volta do almoço) para voltar a receber.
 */
export type DelivererTimeClockStatus =
  | 'CLOCKED_IN'
  | 'NOT_CLOCKED_IN'
  | 'ON_BREAK'
  | 'DAY_ENDED';

const TIME_CLOCK_BLOCK_REASONS: Record<
  Exclude<DelivererTimeClockStatus, 'CLOCKED_IN'>,
  string
> = {
  NOT_CLOCKED_IN: 'Não bateu o ponto de entrada',
  ON_BREAK: 'Em intervalo — falta bater a volta do almoço',
  DAY_ENDED: 'Ponto do dia já encerrado',
};

/** Deriva a situação do ponto a partir dos slots preenchidos do dia. */
export function resolveDelivererTimeClockStatus(slots: {
  ent1?: unknown;
  sai1?: unknown;
  ent2?: unknown;
  sai2?: unknown;
}): DelivererTimeClockStatus {
  if (slots.sai2) return 'DAY_ENDED';
  if (!slots.ent1) return 'NOT_CLOCKED_IN';
  if (slots.sai1 && !slots.ent2) return 'ON_BREAK';
  return 'CLOCKED_IN';
}

/** Entregador pode receber nova rota na tela de vendas. */
export function isDelivererAssignableForSale(
  deliverer: {
    status: string;
    user?: { active?: boolean };
    pendingDeliveryCount?: number;
    /** Unidade em que está disponível no mapa; null se offline ou ainda não definido. */
    availableStoreId?: string | null;
    /**
     * Situação do ponto do dia. `undefined`/`null` = não apurado pelo chamador,
     * e nesse caso não bloqueia (mantém o comportamento de quem ainda não envia
     * o campo).
     */
    timeClockStatus?: DelivererTimeClockStatus | null;
  },
  /** Quando informado, exige disponibilidade nessa unidade. */
  storeId?: string,
): { assignable: boolean; reason: string | null } {
  if (deliverer.user?.active === false) {
    return { assignable: false, reason: 'Inativo' };
  }
  if (deliverer.status === 'OFFLINE') {
    return { assignable: false, reason: 'Indisponível' };
  }
  if (deliverer.timeClockStatus && deliverer.timeClockStatus !== 'CLOCKED_IN') {
    return { assignable: false, reason: TIME_CLOCK_BLOCK_REASONS[deliverer.timeClockStatus] };
  }
  if (storeId) {
    if (!deliverer.availableStoreId) {
      return { assignable: false, reason: 'Indisponível nesta unidade' };
    }
    if (deliverer.availableStoreId !== storeId) {
      return { assignable: false, reason: 'Disponível em outra unidade' };
    }
  }
  return { assignable: true, reason: null };
}
