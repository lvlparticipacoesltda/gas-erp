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

/** Taxa de processamento sobre o valor bruto do pagamento. */
export function computePaymentProcessingFee(
  amount: number,
  config: { feeMode: string; feePercent: number; feeFixed: number },
): number {
  const percent = config.feePercent ?? 0;
  const fixed = config.feeFixed ?? 0;
  let fee = 0;
  switch (config.feeMode) {
    case 'PERCENT':
      fee = amount * (percent / 100);
      break;
    case 'FIXED':
      fee = fixed;
      break;
    case 'PERCENT_AND_FIXED':
      fee = amount * (percent / 100) + fixed;
      break;
    default:
      fee = 0;
  }
  return Math.round(fee * 100) / 100;
}

/** Faturamento líquido = bruto − taxas de processamento. */
export function computeNetRevenue(grossRevenue: number, processingFees: number): number {
  return grossRevenue - processingFees;
}

/** Lucro líquido = lucro bruto − taxas de processamento. */
export function computeNetProfit(grossProfit: number, processingFees: number): number {
  return grossProfit - processingFees;
}

/** Margem bruta em % sobre o CMV. Retorna null quando CMV é zero. */
export function computeGrossMarginPercent(cogs: number, grossProfit: number): number | null {
  if (cogs <= 0) return null;
  return Math.round((grossProfit / cogs) * 10000) / 100;
}

/** Margem líquida em % sobre o CMV. Retorna null quando CMV é zero. */
export function computeNetMarginPercent(cogs: number, netProfit: number): number | null {
  if (cogs <= 0) return null;
  return Math.round((netProfit / cogs) * 10000) / 100;
}
