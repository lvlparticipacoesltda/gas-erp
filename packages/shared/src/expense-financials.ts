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

/** Custo líquido = CMV + taxas de pagamento + despesas operacionais. */
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
