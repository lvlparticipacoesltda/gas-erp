export type MasterNavItem = {
  href: string;
  label: string;
};

export type MasterNavGroup = {
  id: string;
  label: string;
  items: MasterNavItem[];
};

/** Itens de topo sem agrupamento (ex.: Visão geral). */
export const MASTER_NAV_TOP: MasterNavItem[] = [
  { href: '/master/dashboard', label: 'Visão geral' },
];

/** Grupos accordion do painel master. */
export const MASTER_NAV_GROUPS: MasterNavGroup[] = [
  {
    id: 'cadastros',
    label: 'Gestão de Acessos',
    items: [
      { href: '/master/stores', label: 'Lojas' },
      { href: '/master/users', label: 'Usuários' },
      { href: '/master/sessions', label: 'Sessões' },
    ],
  },
  {
    id: 'entregadores',
    label: 'Entregadores',
    items: [
      { href: '/master/deliverers', label: 'Gestão de Usuários' },
      { href: '/master/deliverers/map', label: 'Mapa de entregadores' },
    ],
  },
  {
    id: 'escalas',
    label: 'Escalas e ponto',
    items: [
      { href: '/master/schedules', label: 'Escalas de trabalho' },
      { href: '/master/schedules/ponto', label: 'Cartão de ponto' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [
      { href: '/master/purchases', label: 'Compras' },
      { href: '/master/reports', label: 'Relatórios' },
    ],
  },
];

export const MASTER_SETTINGS_HREF = '/master/settings';

export function allMasterNavHrefs(): string[] {
  return [
    ...MASTER_NAV_TOP.map((i) => i.href),
    ...MASTER_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)),
  ];
}

/** Marca o item mais específico que casa com o pathname. */
export function isMasterNavActive(pathname: string, href: string, allHrefs: string[] = allMasterNavHrefs()) {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  return !allHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

export function masterNavGroupForPath(pathname: string): string | null {
  for (const group of MASTER_NAV_GROUPS) {
    if (group.items.some((item) => isMasterNavActive(pathname, item.href))) {
      return group.id;
    }
  }
  return null;
}
