export function getDelivererAvailabilityLock(position: {
  delivererStatus?: string;
  deliveryStatus?: string | null;
  pendingDeliveries?: unknown[] | null;
  timeClockStatus?: DelivererTimeClockStatus | null;
  /** Regra do ponto ativada na organização (ver `timeClockEnforced`). */
  timeClockEnforced?: boolean;
}): { locked: boolean; reason: string | null; warning: string | null } {
  if (position.deliveryStatus === 'IN_PROGRESS' || position.delivererStatus === 'ON_DELIVERY') {
    return { locked: true, reason: 'Bloqueado em rota', warning: null };
  }
  if ((position.pendingDeliveries?.length ?? 0) > 0) {
    return { locked: true, reason: 'Bloqueado: rota aguardando aceite', warning: null };
  }
  // Pendência de ponto sempre aparece; só vira bloqueio com a regra ativada.
  // Sem isso o mapa contradizia a tela de venda, que recusava o mesmo entregador.
  const timeClockPending =
    position.timeClockStatus && position.timeClockStatus !== 'CLOCKED_IN'
      ? TIME_CLOCK_BLOCK_REASONS[position.timeClockStatus]
      : null;
  if (timeClockPending && position.timeClockEnforced) {
    return { locked: true, reason: timeClockPending, warning: null };
  }
  return { locked: false, reason: null, warning: timeClockPending };
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
    /**
     * Regra do ponto ativada. Desligada (padrão), a pendência vira apenas aviso
     * — foi assim que a regra entrou, para não travar quem já estava em turno.
     */
    timeClockEnforced?: boolean;
  },
  /** Quando informado, exige disponibilidade nessa unidade. */
  storeId?: string,
): { assignable: boolean; reason: string | null; warning: string | null } {
  if (deliverer.user?.active === false) {
    return { assignable: false, reason: 'Inativo', warning: null };
  }
  if (deliverer.status === 'OFFLINE') {
    return { assignable: false, reason: 'Indisponível', warning: null };
  }
  const timeClockPending =
    deliverer.timeClockStatus && deliverer.timeClockStatus !== 'CLOCKED_IN'
      ? TIME_CLOCK_BLOCK_REASONS[deliverer.timeClockStatus]
      : null;
  if (timeClockPending && deliverer.timeClockEnforced) {
    return { assignable: false, reason: timeClockPending, warning: null };
  }
  if (storeId) {
    if (!deliverer.availableStoreId) {
      return { assignable: false, reason: 'Indisponível nesta unidade', warning: null };
    }
    if (deliverer.availableStoreId !== storeId) {
      return { assignable: false, reason: 'Disponível em outra unidade', warning: null };
    }
  }
  return { assignable: true, reason: null, warning: timeClockPending };
}
