/** Helpers puros para métricas de entrega (sem dependências externas). */

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Diferença em segundos entre o início da rota e a criação da venda.
 * Retorna null se a entrega ainda não foi iniciada.
 */
export function getWaitTimeSeconds(
  saleCreatedAt: string | Date,
  deliveryStartedAt: string | Date | null | undefined,
): number | null {
  if (!deliveryStartedAt) return null;
  const created = toDate(saleCreatedAt).getTime();
  const started = toDate(deliveryStartedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(started)) return null;
  return Math.max(0, Math.round((started - created) / 1000));
}

/**
 * Segundos decorridos desde a criação da venda (para entregas PENDING).
 */
export function getElapsedWaitingSeconds(saleCreatedAt: string | Date, now: Date = new Date()): number {
  const created = toDate(saleCreatedAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.round((now.getTime() - created) / 1000));
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
