/** Tolerância para comparar preços unitários (centavos). */
export const SALE_UNIT_PRICE_TOLERANCE = 0.009;

export const SALE_UNIT_PRICE_OVERRIDE_ONLY_GDP_MESSAGE =
  'O preço unitário só pode ser alterado em vendas com benefício Gás do Povo.';

export function saleUnitPricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= SALE_UNIT_PRICE_TOLERANCE;
}

/** Rejeita preço diferente do esperado quando não é benefício Gás do Povo. */
export function assertSaleUnitPriceOverrideAllowed(
  submittedPrice: number,
  expectedPrice: number,
  gasDoPovoBenefit: boolean,
): void {
  if (gasDoPovoBenefit) return;
  if (!saleUnitPricesMatch(submittedPrice, expectedPrice)) {
    throw new Error(SALE_UNIT_PRICE_OVERRIDE_ONLY_GDP_MESSAGE);
  }
}
