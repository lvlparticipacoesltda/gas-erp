'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, MoreVertical } from 'lucide-react';
import { canManagePaymentMethods, type AuthUser } from '@gas-erp/shared';
import { NavLink } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  STORE_NAV_GROUPS,
  allStoreNavHrefs,
  buildStoreHref,
  canAccessStoreNavItem,
  isStoreNavActive,
  storeNavGroupForPath,
} from '@/lib/store-nav';

const OPEN_GROUPS_KEY = 'gas-erp:store-nav-open';

function readOpenGroups(fallback: Record<string, boolean>): Record<string, boolean> {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function defaultOpenGroups(pathname: string, storeId: string): Record<string, boolean> {
  const activeGroup = storeNavGroupForPath(pathname, storeId);
  return Object.fromEntries(
    STORE_NAV_GROUPS.map((g) => [g.id, activeGroup ? g.id === activeGroup : true]),
  );
}

export function StoreSidebarNav({ storeId, user }: { storeId: string; user: AuthUser }) {
  const pathname = usePathname();
  const allHrefs = useMemo(() => allStoreNavHrefs(storeId), [storeId]);
  const visibleGroups = useMemo(
    () =>
      STORE_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => canAccessStoreNavItem(user, item)),
      })).filter((group) => group.items.length > 0),
    [user],
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    defaultOpenGroups(pathname, storeId),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpenGroups(readOpenGroups(defaultOpenGroups(pathname, storeId)));
    setHydrated(true);
    // Só hidrata o estado persistido uma vez no mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const activeGroup = storeNavGroupForPath(pathname, storeId);
    if (!activeGroup) return;
    setOpenGroups((prev) => {
      if (prev[activeGroup]) return prev;
      const next = { ...prev, [activeGroup]: true };
      try {
        window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [pathname, storeId, hydrated]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <nav className="space-y-1">
      {visibleGroups.map((group) => {
        const open = openGroups[group.id] ?? true;
        const groupActive = group.items.some((item) =>
          isStoreNavActive(pathname, buildStoreHref(storeId, item.segment), allHrefs),
        );

        return (
          <div key={group.id} className="pt-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={open}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide transition',
                groupActive ? 'text-brand-dark' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
              )}
            >
              <span>{group.label}</span>
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 transition-transform', open ? 'rotate-0' : '-rotate-90')}
                aria-hidden
              />
            </button>
            {open && (
              <div className="ml-2 space-y-0.5 border-l border-slate-200 pl-2">
                {group.items.map((item) => {
                  const href = buildStoreHref(storeId, item.segment);
                  return (
                    <NavLink key={item.segment} href={href} active={isStoreNavActive(pathname, href, allHrefs)}>
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {user.role === 'ORG_MASTER' && (
        <div className="pt-2">
          <NavLink href="/master/dashboard" active={pathname.startsWith('/master')}>
            Painel Master
          </NavLink>
        </div>
      )}
    </nav>
  );
}

export function StoreAccountMenu({
  storeId,
  userName,
  role,
  onLogout,
}: {
  storeId: string;
  userName: string;
  role: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsHref = `/store/${storeId}/settings`;
  const paymentMethodsHref = `/store/${storeId}/settings/payment-methods`;
  const showPaymentMethods = canManagePaymentMethods(role);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Minha Conta</div>
          <div className="truncate text-sm font-medium text-slate-900" title={userName}>
            {userName}
          </div>
        </div>
        <button
          type="button"
          aria-label="Opções da conta"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="ui-dropdown-enter absolute bottom-full left-0 z-50 mb-2 w-full min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <Link
            role="menuitem"
            href={settingsHref}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Editar informações
          </Link>
          {showPaymentMethods && (
            <Link
              role="menuitem"
              href={paymentMethodsHref}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              Formas de pagamento
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
