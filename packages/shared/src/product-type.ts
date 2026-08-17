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

/**
 * GLP 13KG (P13) — botijão cheio de 13 kg, não vasilhame nem Gás do Povo.
 */
export function isGlpP13Product(product: {
  name?: string | null;
  sku?: string | null;
  productType?: string | null;
}): boolean {
  const type = normalizeProductType(product.productType ?? '');
  if (!type.includes('GLP') && !type.startsWith('GAS')) return false;
  if (isVasilhameType(type)) return false;

  const sku = normalizeProductType(product.sku ?? '');
  const name = normalizeProductType(product.name ?? '');
  if (sku.includes('GDP') || name.includes('POVO')) return false;

  if (sku.includes('P13')) return true;
  if (/(^|[^A-Z0-9])P13([^A-Z0-9]|$)/.test(name)) return true;
  if (name.includes('13KG') || name.includes('13 KG')) return true;
  return false;
}
