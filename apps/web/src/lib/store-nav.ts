import type { StoreScreenKey } from '@gas-erp/shared';

export const STORE_NAV_ITEMS: {
  screen: StoreScreenKey;
  segment: string;
  label: string;
}[] = [
  { screen: 'store.dashboard', segment: 'dashboard', label: 'Dashboard' },
  { screen: 'store.sales.new', segment: 'sales/new', label: 'Nova venda' },
  { screen: 'store.sales', segment: 'sales', label: 'Vendas' },
  { screen: 'store.customers', segment: 'customers', label: 'Clientes' },
  { screen: 'store.products', segment: 'products', label: 'Produtos' },
  { screen: 'store.stock', segment: 'stock', label: 'Estoque' },
  { screen: 'store.stock.transfers', segment: 'stock/transfers', label: 'Transferências' },
  { screen: 'store.deliverers', segment: 'deliverers', label: 'Entregadores' },
  { screen: 'store.daily-summary', segment: 'daily-summary', label: 'Resumo diário' },
];

export function pathnameToStoreScreen(pathname: string, storeId: string): StoreScreenKey | null {
  const prefix = `/store/${storeId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/\/$/, '');
  if (rest === 'settings') return null;
  const item = STORE_NAV_ITEMS.find((nav) => nav.segment === rest);
  return item?.screen ?? null;
}

export function buildStoreHref(storeId: string, segment: string) {
  return `/store/${storeId}/${segment}`;
}
