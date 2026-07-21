/**
 * Helpers para classificar `Product.productType` (campo livre em string).
 *
 * Produtos "cheios" (GLP e Água) exigem um vasilhame (vazio) correspondente
 * vinculado, usado para travar a entrada de botijões/garrafões ao estoque de
 * vasilhames. Vasilhames são os produtos vazios (VASILHAME/CANISTER/VESSEL).
 */
export function normalizeProductType(type: string): string {
  return (type ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Produto "cheio" que consome vasilhame ao entrar em estoque (GLP ou Água). */
export function productTypeRequiresVasilhame(type: string): boolean {
  const t = normalizeProductType(type);
  return t.includes('GLP') || t.startsWith('GAS') || t.includes('AGUA') || t.includes('WATER');
}

/** Produto que representa um vasilhame vazio. */
export function isVasilhameType(type: string): boolean {
  const t = normalizeProductType(type);
  return t.includes('VASILHAME') || t.includes('CANISTER') || t.includes('VESSEL');
}
