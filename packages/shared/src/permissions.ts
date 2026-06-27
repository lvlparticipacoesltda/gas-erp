import { z } from 'zod';

export const STORE_SCREEN_KEYS = [
  'store.sales',
  'store.sales.new',
  'store.customers',
  'store.products',
  'store.suppliers',
  'store.purchases',
  'store.stock',
  'store.stock.transfers',
  'store.deliverers',
  'store.deliverers.map',
  'store.daily-summary',
  'store.reports',
] as const;

export type StoreScreenKey = (typeof STORE_SCREEN_KEYS)[number];

export const STORE_SCREEN_LABELS: Record<StoreScreenKey, string> = {
  'store.sales': 'Vendas',
  'store.sales.new': 'Nova venda',
  'store.customers': 'Clientes',
  'store.products': 'Produtos',
  'store.suppliers': 'Fornecedores',
  'store.purchases': 'Compras',
  'store.stock': 'Estoque',
  'store.stock.transfers': 'Transferências',
  'store.deliverers': 'Entregadores',
  'store.deliverers.map': 'Mapa de entregadores',
  'store.daily-summary': 'Resumo diário',
  'store.reports': 'Relatórios',
};

const ALL_STORE_SCREENS: StoreScreenKey[] = [...STORE_SCREEN_KEYS];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, StoreScreenKey[]> = {
  PLATFORM_ADMIN: ALL_STORE_SCREENS,
  ORG_MASTER: ALL_STORE_SCREENS,
  STORE_MANAGER: ALL_STORE_SCREENS,
  ATTENDANT: ['store.daily-summary', 'store.sales', 'store.sales.new', 'store.customers', 'store.deliverers.map'],
  FINANCE: [
    'store.daily-summary',
    'store.sales',
    'store.customers',
    'store.suppliers',
    'store.purchases',
    'store.reports',
  ],
  DELIVERER: ['store.daily-summary'],
};

const LEGACY_SCREEN_ALIASES: Record<string, StoreScreenKey> = {
  'store.dashboard': 'store.daily-summary',
};

function normalizeScreenKey(screen: string): StoreScreenKey | null {
  const aliased = LEGACY_SCREEN_ALIASES[screen] ?? screen;
  return STORE_SCREEN_KEYS.includes(aliased as StoreScreenKey)
    ? (aliased as StoreScreenKey)
    : null;
}

export function canManageSales(role: string): boolean {
  return role === 'ORG_MASTER' || role === 'STORE_MANAGER' || role === 'PLATFORM_ADMIN';
}

/** Aprovação de vendas criadas pelo app do entregador. */
export function canApproveMobileSales(role: string): boolean {
  return (
    role === 'ORG_MASTER'
    || role === 'STORE_MANAGER'
    || role === 'ATTENDANT'
    || role === 'PLATFORM_ADMIN'
  );
}

export const canManageDeliverers = canManageSales;

/** Margem / custo fornecedor — master, gerente e financeiro. */
export function canViewFinancialMargins(role: string): boolean {
  return (
    role === 'ORG_MASTER'
    || role === 'STORE_MANAGER'
    || role === 'FINANCE'
    || role === 'PLATFORM_ADMIN'
  );
}

/** Configuração de formas de pagamento e taxas — master, gerente e financeiro. */
export function canManagePaymentMethods(role: string): boolean {
  return (
    role === 'ORG_MASTER'
    || role === 'STORE_MANAGER'
    || role === 'FINANCE'
    || role === 'PLATFORM_ADMIN'
  );
}

/** Disponível / indisponível no mapa — gerente ou quem tem tela do mapa (ex.: atendente). */
export function canToggleDelivererAvailability(
  role: string,
  permissions?: string[] | null,
): boolean {
  if (canManageDeliverers(role)) return true;
  return hasScreenPermission(role, permissions, 'store.deliverers.map');
}

export function resolveUserPermissions(role: string, custom?: string[] | null): string[] {
  if (custom && custom.length > 0) {
    const normalized = custom
      .map((key) => normalizeScreenKey(key))
      .filter((key): key is StoreScreenKey => key !== null);
    return [...new Set(normalized)];
  }
  return ROLE_DEFAULT_PERMISSIONS[role] ?? ['store.daily-summary'];
}

export function hasScreenPermission(
  role: string,
  custom: string[] | null | undefined,
  screen: string,
): boolean {
  if (role === 'ORG_MASTER' || role === 'PLATFORM_ADMIN') return true;
  const normalized = normalizeScreenKey(screen);
  if (!normalized) return false;
  return resolveUserPermissions(role, custom).includes(normalized);
}

export const userPermissionsSchema = z.array(z.enum(STORE_SCREEN_KEYS)).optional();
