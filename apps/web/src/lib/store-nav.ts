import type { StoreScreenKey } from '@gas-erp/shared';
import {
  canAccessHorarios,
  canManagePaymentMethods,
  canViewExpenses,
  canViewTimeClockLog,
  hasScreenPermission,
} from '@gas-erp/shared';
import type { AuthUser } from '@gas-erp/shared';

export type StoreNavItem = {
  /** Omitido para itens com acesso por papel (ex.: formas de pagamento). */
  screen?: StoreScreenKey;
  segment: string;
  label: string;
};

export type StoreNavGroup = {
  id: string;
  label: string;
  items: StoreNavItem[];
};

/** Itens de topo sem agrupamento (ex.: Resumo diário). */
export const STORE_NAV_TOP: StoreNavItem[] = [
  { screen: 'store.daily-summary', segment: 'daily-summary', label: 'Resumo diário' },
];

/** Grupos accordion do painel da loja. */
export const STORE_NAV_GROUPS: StoreNavGroup[] = [
  {
    id: 'operacao',
    label: 'Operação',
    items: [
      { screen: 'store.sales.new', segment: 'sales/new', label: 'Nova venda' },
      { screen: 'store.sales', segment: 'sales', label: 'Vendas' },
      { screen: 'store.customers', segment: 'customers', label: 'Clientes' },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque e compras',
    items: [
      { screen: 'store.products', segment: 'products', label: 'Produtos' },
      { screen: 'store.suppliers', segment: 'suppliers', label: 'Fornecedores' },
      { screen: 'store.purchases', segment: 'purchases', label: 'Compras' },
      { screen: 'store.stock', segment: 'stock', label: 'Estoque' },
      { screen: 'store.stock.transfers', segment: 'stock/transfers', label: 'Transferências' },
    ],
  },
  {
    id: 'equipe',
    label: 'Equipe',
    items: [
      { screen: 'store.deliverers', segment: 'deliverers', label: 'Entregadores' },
      { screen: 'store.deliverers.map', segment: 'deliverers/map', label: 'Mapa de entregadores' },
      { screen: 'store.schedules.horarios', segment: 'schedules/horarios', label: 'Horários' },
      { screen: 'store.schedules', segment: 'schedules', label: 'Escalas de trabalho' },
      { screen: 'store.time-clock', segment: 'schedules/ponto', label: 'Cartão de ponto' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [{ segment: 'expenses', label: 'Gastos da empresa' }],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    items: [{ screen: 'store.reports', segment: 'reports', label: 'Relatórios' }],
  },
  {
    id: 'configuracao',
    label: 'Configuração',
    items: [{ segment: 'settings/payment-methods', label: 'Formas de pagamento' }],
  },
];

/** Lista plana (ordem de prioridade para fallback de rota). */
export const STORE_NAV_ITEMS: StoreNavItem[] = [
  ...STORE_NAV_TOP,
  ...STORE_NAV_GROUPS.flatMap((g) => g.items),
];

export function canAccessStoreNavItem(user: AuthUser, item: StoreNavItem): boolean {
  // Itens sem chave de tela têm acesso definido por papel.
  if (!item.screen) {
    if (item.segment === 'expenses') return canViewExpenses(user.role);
    return item.segment === 'settings/payment-methods' && canManagePaymentMethods(user.role);
  }
  if (item.screen === 'store.schedules.horarios') {
    return canAccessHorarios(user.role, user.permissions);
  }
  if (item.screen === 'store.time-clock') {
    return canViewTimeClockLog(user.role, user.permissions);
  }
  return hasScreenPermission(user.role, user.permissions, item.screen);
}

export function storeNavItemForPath(pathname: string, storeId: string): StoreNavItem | null {
  const prefix = `/store/${storeId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/\/$/, '');
  if (rest === 'dashboard' || rest === 'settings') return null;
  return (
    STORE_NAV_ITEMS.filter(
      (nav) => rest === nav.segment || rest.startsWith(`${nav.segment}/`),
    ).sort((a, b) => b.segment.length - a.segment.length)[0] ?? null
  );
}

export function pathnameToStoreScreen(pathname: string, storeId: string): StoreScreenKey | null {
  return storeNavItemForPath(pathname, storeId)?.screen ?? null;
}

export function buildStoreHref(storeId: string, segment: string) {
  return `/store/${storeId}/${segment}`;
}

/** Primeira tela permitida ao usuário na loja (fallback após login ou permissão negada). */
export function defaultStorePath(storeId: string, user: AuthUser): string {
  const item = STORE_NAV_ITEMS.find((nav) => canAccessStoreNavItem(user, nav));
  return item ? buildStoreHref(storeId, item.segment) : `/store/${storeId}/settings`;
}

export function allStoreNavHrefs(storeId: string): string[] {
  return STORE_NAV_ITEMS.map((item) => buildStoreHref(storeId, item.segment));
}

/** Marca o item mais específico que casa com o pathname. */
export function isStoreNavActive(pathname: string, href: string, allHrefs: string[]) {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  return !allHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

export function storeNavGroupForPath(pathname: string, storeId: string): string | null {
  const allHrefs = allStoreNavHrefs(storeId);
  for (const group of STORE_NAV_GROUPS) {
    if (
      group.items.some((item) =>
        isStoreNavActive(pathname, buildStoreHref(storeId, item.segment), allHrefs),
      )
    ) {
      return group.id;
    }
  }
  return null;
}
