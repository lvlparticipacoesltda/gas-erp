import { z } from 'zod';

export const STORE_SCREEN_KEYS = [
  'store.dashboard',
  'store.sales',
  'store.sales.new',
  'store.customers',
  'store.products',
  'store.stock',
  'store.stock.transfers',
  'store.deliverers',
  'store.daily-summary',
] as const;

export type StoreScreenKey = (typeof STORE_SCREEN_KEYS)[number];

export const STORE_SCREEN_LABELS: Record<StoreScreenKey, string> = {
  'store.dashboard': 'Dashboard',
  'store.sales': 'Vendas',
  'store.sales.new': 'Nova venda',
  'store.customers': 'Clientes',
  'store.products': 'Produtos',
  'store.stock': 'Estoque',
  'store.stock.transfers': 'Transferências',
  'store.deliverers': 'Entregadores',
  'store.daily-summary': 'Resumo diário',
};

const ALL_STORE_SCREENS: StoreScreenKey[] = [...STORE_SCREEN_KEYS];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, StoreScreenKey[]> = {
  PLATFORM_ADMIN: ALL_STORE_SCREENS,
  ORG_MASTER: ALL_STORE_SCREENS,
  STORE_MANAGER: ALL_STORE_SCREENS,
  ATTENDANT: ['store.dashboard', 'store.sales', 'store.sales.new', 'store.customers'],
  FINANCE: ['store.dashboard', 'store.sales', 'store.daily-summary', 'store.customers'],
  DELIVERER: ['store.dashboard'],
};

export function resolveUserPermissions(role: string, custom?: string[] | null): string[] {
  if (custom && custom.length > 0) {
    return custom.filter((key) => STORE_SCREEN_KEYS.includes(key as StoreScreenKey));
  }
  return ROLE_DEFAULT_PERMISSIONS[role] ?? ['store.dashboard'];
}

export function hasScreenPermission(
  role: string,
  custom: string[] | null | undefined,
  screen: string,
): boolean {
  if (role === 'ORG_MASTER' || role === 'PLATFORM_ADMIN') return true;
  return resolveUserPermissions(role, custom).includes(screen);
}

export const userPermissionsSchema = z.array(z.enum(STORE_SCREEN_KEYS)).optional();
