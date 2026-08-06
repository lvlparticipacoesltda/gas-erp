/**
 * Regra "só recebe entrega quem bateu o ponto".
 *
 * Desligada por padrão de propósito: ela entrou com a operação em curso e, ativa
 * de imediato, tirava da fila entregadores que já estavam trabalhando naquele
 * turno — sem que ninguém entendesse o motivo. Com ela desligada a pendência de
 * ponto continua visível na venda e no mapa, mas não impede a alocação.
 *
 * Ligue com `TIME_CLOCK_DELIVERY_BLOCK=true` quando a equipe já estiver batendo
 * ponto de forma consistente.
 */
export function isTimeClockDeliveryBlockEnabled(): boolean {
  return process.env.TIME_CLOCK_DELIVERY_BLOCK === 'true';
}
