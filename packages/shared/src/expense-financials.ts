import { toNumber } from './business-day';

export interface ExpenseAmountInput {
  amount: unknown;
}

/** Soma de despesas (Decimal do Prisma ou number). */
export function sumExpenseAmounts(expenses: ExpenseAmountInput[]): number {
  const cents = expenses.reduce(
    (sum, expense) => sum + Math.round(toNumber(expense.amount) * 100),
    0,
  );
  return cents / 100;
}

/**
 * Rateio das despesas da organização (sem unidade) entre as lojas, proporcional
 * ao faturamento de cada uma no período.
 *
 * Sem faturamento no período (loja nova, dia sem venda), cai para rateio igualitário —
 * caso contrário o custo fixo sumiria do resultado. A distribuição é feita em centavos
 * pelo método do maior resto, então a soma das partes fecha exatamente com o total.
 */
export function allocateSharedExpenses(
  sharedTotal: number,
  revenueByStore: Iterable<readonly [string, number]>,
): Map<string, number> {
  const entries = [...revenueByStore];
  const result = new Map<string, number>();
  if (entries.length === 0) return result;

  const totalCents = Math.round(sharedTotal * 100);
  if (totalCents === 0) {
    for (const [storeId] of entries) result.set(storeId, 0);
    return result;
  }

  const totalRevenue = entries.reduce((sum, [, revenue]) => sum + Math.max(0, revenue), 0);
  const shares = entries.map(([storeId, revenue]) => {
    const weight =
      totalRevenue > 0 ? Math.max(0, revenue) / totalRevenue : 1 / entries.length;
    const exact = totalCents * weight;
    const floor = Math.floor(exact);
    return { storeId, floor, remainder: exact - floor };
  });

  const distributed = shares.reduce((sum, share) => sum + share.floor, 0);
  const leftover = totalCents - distributed;
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < leftover; i += 1) {
    byRemainder[i % byRemainder.length].floor += 1;
  }

  for (const share of shares) result.set(share.storeId, share.floor / 100);
  return result;
}

/** Custo líquido = CMV + taxas de pagamento + despesas operacionais do período. */
export function computeNetCost(
  cogs: number,
  processingFees: number,
  operatingExpenses: number,
): number {
  return Math.round((cogs + processingFees + operatingExpenses) * 100) / 100;
}

/** Lucro líquido = faturamento − custo líquido. */
export function computeNetProfitFromNetCost(revenue: number, netCost: number): number {
  return Math.round((revenue - netCost) * 100) / 100;
}
