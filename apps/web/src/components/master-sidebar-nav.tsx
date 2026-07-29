'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, MoreVertical } from 'lucide-react';
import { NavLink } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  MASTER_NAV_GROUPS,
  MASTER_NAV_TOP,
  MASTER_SETTINGS_HREF,
  allMasterNavHrefs,
  isMasterNavActive,
  masterNavGroupForPath,
} from '@/lib/master-nav';

const OPEN_GROUPS_KEY = 'gas-erp:master-nav-open';

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

function defaultOpenGroups(pathname: string): Record<string, boolean> {
  const activeGroup = masterNavGroupForPath(pathname);
  return Object.fromEntries(
    MASTER_NAV_GROUPS.map((g) => [g.id, activeGroup ? g.id === activeGroup : true]),
  );
}

export function MasterSidebarNav() {
  const pathname = usePathname();
  const allHrefs = useMemo(() => allMasterNavHrefs(), []);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => defaultOpenGroups(pathname));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpenGroups(readOpenGroups(defaultOpenGroups(pathname)));
    setHydrated(true);
    // Só hidrata o estado persistido uma vez no mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const activeGroup = masterNavGroupForPath(pathname);
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
  }, [pathname, hydrated]);

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
      {MASTER_NAV_TOP.map((item) => (
        <NavLink key={item.href} href={item.href} active={isMasterNavActive(pathname, item.href, allHrefs)}>
          {item.label}
        </NavLink>
      ))}

      {MASTER_NAV_GROUPS.map((group) => {
        const open = openGroups[group.id] ?? true;
        const groupActive = group.items.some((item) => isMasterNavActive(pathname, item.href, allHrefs));

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
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    active={isMasterNavActive(pathname, item.href, allHrefs)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function MasterAccountMenu({
  userName,
  onLogout,
}: {
  userName: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
            href={MASTER_SETTINGS_HREF}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Editar informações
          </Link>
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
