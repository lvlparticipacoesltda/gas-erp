/** Helpers puros para métricas de entrega (sem dependências externas). */

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function diffSeconds(from: string | Date, to: string | Date): number | null {
  const start = toDate(from).getTime();
  const end = toDate(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 1000));
}

/**
 * Tempo entre o cadastro da venda e o início da rota pelo entregador.
 * Retorna null se a entrega ainda não foi iniciada.
 */
export function getWaitTimeSeconds(
  saleCreatedAt: string | Date,
  deliveryStartedAt: string | Date | null | undefined,
): number | null {
  if (!deliveryStartedAt) return null;
  return diffSeconds(saleCreatedAt, deliveryStartedAt);
}

/**
 * Tempo entre o início da rota e a conclusão da entrega.
 * Retorna null se a rota ainda não foi iniciada ou não foi finalizada.
 */
export function getRouteDurationSeconds(
  deliveryStartedAt: string | Date | null | undefined,
  deliveryCompletedAt: string | Date | null | undefined,
): number | null {
  if (!deliveryStartedAt || !deliveryCompletedAt) return null;
  return diffSeconds(deliveryStartedAt, deliveryCompletedAt);
}

/**
 * Segundos decorridos desde um instante de referência (ex.: criação da venda ou início da rota).
 */
export function getElapsedWaitingSeconds(saleCreatedAt: string | Date, now: Date = new Date()): number {
  const created = toDate(saleCreatedAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.round((now.getTime() - created) / 1000));
}

export function getDeliveryPhaseMetrics(input: {
  saleCreatedAt: string | Date;
  deliveryStartedAt?: string | Date | null;
  deliveryCompletedAt?: string | Date | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const waitTimeSeconds = getWaitTimeSeconds(input.saleCreatedAt, input.deliveryStartedAt);
  const routeDurationSeconds = getRouteDurationSeconds(input.deliveryStartedAt, input.deliveryCompletedAt);
  const elapsedWaitingSeconds = getElapsedWaitingSeconds(input.saleCreatedAt, now);
  const elapsedRouteSeconds =
    input.deliveryStartedAt && !input.deliveryCompletedAt
      ? getElapsedWaitingSeconds(input.deliveryStartedAt, now)
      : null;

  return {
    waitTimeSeconds,
    routeDurationSeconds,
    elapsedWaitingSeconds,
    elapsedRouteSeconds,
  };
}

/**
 * Formata uma quantidade de segundos como tempo de espera legível.
 * Ex.: "5 min", "1h 12min", "—" quando null/undefined.
 */
export function formatWaitTime(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 1) return 'menos de 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

/** Rótulo de espera até iniciar a rota (histórico concluído). */
export function formatCompletedWaitLabel(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  return `Esperou ${formatWaitTime(seconds)}`;
}

/** Rótulo de duração em rota (histórico concluído). */
export function formatCompletedRouteLabel(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  return `Em rota: ${formatWaitTime(seconds)}`;
}

/** Junta espera + rota para cards de histórico. */
export function formatCompletedDeliveryPhases(input: {
  waitTimeSeconds?: number | null;
  routeDurationSeconds?: number | null;
  saleCreatedAt?: string | Date;
  deliveryStartedAt?: string | Date | null;
  deliveryCompletedAt?: string | Date | null;
}): string {
  const wait =
    input.waitTimeSeconds
    ?? (input.saleCreatedAt && input.deliveryStartedAt
      ? getWaitTimeSeconds(input.saleCreatedAt, input.deliveryStartedAt)
      : null);
  const route =
    input.routeDurationSeconds
    ?? getRouteDurationSeconds(input.deliveryStartedAt, input.deliveryCompletedAt);

  const parts: string[] = [];
  const waitLabel = formatCompletedWaitLabel(wait);
  const routeLabel = formatCompletedRouteLabel(route);
  if (waitLabel) parts.push(waitLabel);
  if (routeLabel) parts.push(routeLabel);
  return parts.join(' · ');
}
