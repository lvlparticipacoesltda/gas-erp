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

/**
 * Percentual de uma linha do resultado sobre o faturamento: participação de custo
 * ou margem sobre a receita. Sem faturamento no período não há base, então retorna
 * null em vez de zero.
 *
 * No resumo/visão geral a margem operacional usa {@link computeCogsMarginPercent}
 * (base = CMV). Esta função permanece para o DRE, onde cada linha é % da receita.
 */
export function computeMarginPercent(revenue: number, value: number): number | null {
  if (revenue <= 0) return null;
  return Math.round((value / revenue) * 10000) / 100;
}

/**
 * Margem sobre o CMV: lucro ÷ custo da mercadoria.
 *
 * Ex.: venda 100, CMV 80 → 25% (não 20%, que seria sobre o faturamento).
 * Sem CMV no período não há base — retorna null.
 */
export function computeCogsMarginPercent(cogs: number, profit: number): number | null {
  if (cogs <= 0) return null;
  return Math.round((profit / cogs) * 10000) / 100;
}
