/** Tolerância para comparar preços unitários (centavos). */
export const SALE_UNIT_PRICE_TOLERANCE = 0.009;

export const SALE_UNIT_PRICE_OVERRIDE_ONLY_GDP_MESSAGE =
  'O preço unitário só pode ser alterado em vendas com benefício Gás do Povo.';

export function saleUnitPricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= SALE_UNIT_PRICE_TOLERANCE;
}

/** Permite preço unitário customizado em qualquer forma de pagamento. */
export function assertSaleUnitPriceOverrideAllowed(
  _submittedPrice: number,
  _expectedPrice: number,
  _gasDoPovoBenefit?: boolean,
): void {
  // Sem restrição — o painel pode ajustar o preço na nova venda.
}
