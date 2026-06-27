import { toNumber } from './business-day';

export interface SaleItemCostInput {
  quantity: number;
  unitCost: unknown;
}

/** CMV de uma venda a partir dos itens (usa unitCost gravado na venda). */
export function computeSaleCogs(items: SaleItemCostInput[]): number {
  return items.reduce((sum, item) => sum + item.quantity * toNumber(item.unitCost), 0);
}

/** Lucro bruto = faturamento da venda − CMV dos produtos. */
export function computeGrossProfit(revenue: number, cogs: number): number {
  return revenue - cogs;
}

/** Margem bruta em % sobre o faturamento. */
export function computeGrossMarginPercent(revenue: number, grossProfit: number): number | null {
  if (revenue <= 0) return null;
  return Math.round((grossProfit / revenue) * 10000) / 100;
}
