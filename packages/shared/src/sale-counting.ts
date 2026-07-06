/** Status de venda que entram em faturamento dos painéis (venda efetivada). */
export const COUNTED_SALE_STATUSES = ['DELIVERED', 'PORTARIA'] as const;

export type CountedSaleStatus = (typeof COUNTED_SALE_STATUSES)[number];

export function isCountedSaleStatus(status: string): status is CountedSaleStatus {
  return COUNTED_SALE_STATUSES.includes(status as CountedSaleStatus);
}
