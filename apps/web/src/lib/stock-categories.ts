import type { DailySummaryData } from '@/components/daily-summary-content';

export type StockGroup = NonNullable<DailySummaryData['stockAll']>['groups'][number];
export type StockProduct = StockGroup['products'][number];

export const STOCK_CATEGORY_ORDER = ['GLP', 'VASILHAME', 'AGUA', 'OUTROS'] as const;
export type StockCategory = (typeof STOCK_CATEGORY_ORDER)[number];

export const STOCK_CATEGORY_LABELS: Record<StockCategory, string> = {
  GLP: 'Gás (GLP)',
  VASILHAME: 'Vasilhames',
  AGUA: 'Água',
  OUTROS: 'Outros',
};

function normalizeType(type: string): string {
  return type
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Só Gás (GLP), Vasilhame e Água ficam separados; todo o resto vai para "Outros". */
export function resolveStockCategory(type: string): StockCategory {
  const t = normalizeType(type);
  if (t.includes('GLP') || t.startsWith('GAS')) return 'GLP';
  if (t.includes('VASILHAME') || t.includes('CANISTER') || t.includes('VESSEL')) {
    return 'VASILHAME';
  }
  if (t.includes('AGUA') || t.includes('WATER')) return 'AGUA';
  return 'OUTROS';
}

export interface StockCategoryGroup {
  key: StockCategory;
  label: string;
  products: StockProduct[];
  subtotal: { opening: number; out: number; closing: number; soldRevenue: number };
}

/**
 * Agrupa o estoque do período nas 4 categorias exibidas, na ordem fixa de
 * `STOCK_CATEGORY_ORDER`. Categorias sem produto ficam de fora.
 */
export function groupStockByCategory(
  groups: StockGroup[] | undefined,
): StockCategoryGroup[] {
  const buckets = new Map<StockCategory, StockProduct[]>();
  for (const group of groups ?? []) {
    const category = resolveStockCategory(group.type);
    const list = buckets.get(category) ?? [];
    list.push(...group.products);
    buckets.set(category, list);
  }

  return STOCK_CATEGORY_ORDER.filter((category) => buckets.has(category)).map((category) => {
    const products = (buckets.get(category) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const subtotal = products.reduce(
      (sum, p) => ({
        opening: sum.opening + p.opening,
        out: sum.out + p.out,
        closing: sum.closing + p.closing,
        soldRevenue: sum.soldRevenue + p.soldRevenue,
      }),
      { opening: 0, out: 0, closing: 0, soldRevenue: 0 },
    );
    return { key: category, label: STOCK_CATEGORY_LABELS[category], products, subtotal };
  });
}
