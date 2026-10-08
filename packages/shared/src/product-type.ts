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

export type GlpCylinderSize = 'P13' | 'P20' | 'P45';

const GLP_CYLINDER_SIZES: { size: GlpCylinderSize; kg: string }[] = [
  { size: 'P45', kg: '45' },
  { size: 'P20', kg: '20' },
  { size: 'P13', kg: '13' },
];

type ProductRef = {
  name?: string | null;
  sku?: string | null;
  productType?: string | null;
};

function isGlpFilledProduct(product: ProductRef): boolean {
  const type = normalizeProductType(product.productType ?? '');
  if (!type.includes('GLP') && !type.startsWith('GAS')) return false;
  return !isVasilhameType(type);
}

function matchesGlpCylinderSize(product: ProductRef, size: GlpCylinderSize, kg: string): boolean {
  const sku = normalizeProductType(product.sku ?? '');
  const name = normalizeProductType(product.name ?? '');
  if (sku.includes(size)) return true;
  if (new RegExp(`(^|[^A-Z0-9])${size}([^A-Z0-9]|$)`).test(name)) return true;
  return name.includes(`${kg}KG`) || name.includes(`${kg} KG`);
}

/**
 * Tamanho do botijão cheio (P13 / P20 / P45), incluindo Gás do Povo quando o
 * SKU/nome ainda identifica o peso. Vasilhame e produto que não é GLP: `null`.
 */
export function glpCylinderSize(product: ProductRef): GlpCylinderSize | null {
  if (!isGlpFilledProduct(product)) return null;
  for (const { size, kg } of GLP_CYLINDER_SIZES) {
    if (matchesGlpCylinderSize(product, size, kg)) return size;
  }
  return null;
}

/**
 * GLP 13KG (P13) — botijão cheio de 13 kg, não vasilhame nem Gás do Povo.
 */
export function isGlpP13Product(product: ProductRef): boolean {
  const sku = normalizeProductType(product.sku ?? '');
  const name = normalizeProductType(product.name ?? '');
  if (sku.includes('GDP') || name.includes('POVO')) return false;
  return glpCylinderSize(product) === 'P13';
}

export function isGlpP20Product(product: ProductRef): boolean {
  return glpCylinderSize(product) === 'P20';
}

export function isGlpP45Product(product: ProductRef): boolean {
  return glpCylinderSize(product) === 'P45';
}

function isWaterVesselName(product: ProductRef): boolean {
  const sku = normalizeProductType(product.sku ?? '');
  const name = normalizeProductType(product.name ?? '');
  return (
    isVasilhameType(product.productType ?? '') ||
    name.includes('VASILHAME') ||
    name.includes('GALAO') ||
    sku.startsWith('VAS-') ||
    sku.includes('VASILHAME')
  );
}

/** Garrafão cheio de água (não vasilhame / galão vazio). */
export function isWaterFilledProduct(product: ProductRef): boolean {
  const type = normalizeProductType(product.productType ?? '');
  if (!type.includes('AGUA') && !type.includes('WATER')) return false;
  return !isWaterVesselName(product);
}

/** Água 20L cheia — ex.: Água Cristal 20L. */
export function isAgua20LProduct(product: ProductRef): boolean {
  if (!isWaterFilledProduct(product)) return false;
  const sku = normalizeProductType(product.sku ?? '');
  const name = normalizeProductType(product.name ?? '');
  return (
    name.includes('20L') ||
    name.includes('20 L') ||
    sku.includes('20L') ||
    sku.includes('20 L')
  );
}
