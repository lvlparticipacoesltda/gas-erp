'use client';

import { useLayoutEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  api,
  clearAuth,
  getCurrentStoreId,
  getToken,
  refreshStoredUser,
  setCurrentStoreId,
} from '@/lib/api';
import { buildStoreHref, defaultStorePath, STORE_NAV_ITEMS } from '@/lib/store-nav';
import { NavLink } from '@/components/ui';
import { Logo } from '@/components/logo';
import { PageLoader } from '@/components/brand-loader';
import { canManagePaymentMethods, hasScreenPermission, ROLE_LABELS } from '@gas-erp/shared';
import type { AuthUser } from '@gas-erp/shared';

interface Store {
  id: string;
  name: string;
  code: string;
}

let cachedUser: AuthUser | null = null;
let cachedStores: Store[] | null = null;
let storesRequest: Promise<Store[]> | null = null;

function fetchStores(): Promise<Store[]> {
  if (cachedStores) return Promise.resolve(cachedStores);
  if (!storesRequest) {
    const token = getToken();
    storesRequest = api<Store[]>('/stores', {}, token).then((data) => {
      cachedStores = data;
      return data;
    });
  }
  return storesRequest;
}

export function clearAppShellCache() {
  cachedUser = null;
  cachedStores = null;
  storesRequest = null;
}

export function AppShell({ children, mode }: { children: React.ReactNode; mode: 'master' | 'store' }) {
  const router = useRouter();
  const pathname = usePathname();
  const storeIdFromPath = pathname.match(/^\/store\/([^/]+)/)?.[1] ?? null;

  const [user, setUser] = useState<AuthUser | null>(() => cachedUser);
  const [sessionReady, setSessionReady] = useState(false);
  const [stores, setStores] = useState<Store[]>(() => cachedStores ?? []);
  const [storeId, setStoreId] = useState<string | null>(() => storeIdFromPath ?? getCurrentStoreId());

  useLayoutEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    void refreshStoredUser()
      .then((fresh) => {
        if (!fresh || fresh.role === 'DELIVERER') {
          clearAuth();
          clearAppShellCache();
          router.replace('/login');
          return;
        }
        cachedUser = fresh;
        setUser(fresh);
        setSessionReady(true);

        return fetchStores().then((data) => {
          setStores(data);
          if (mode === 'store') {
            if (storeIdFromPath) {
              setStoreId(storeIdFromPath);
              setCurrentStoreId(storeIdFromPath);
            } else if (getCurrentStoreId() && data.some((s) => s.id === getCurrentStoreId())) {
              setStoreId(getCurrentStoreId());
            } else if (data[0]) {
              setStoreId(data[0].id);
              setCurrentStoreId(data[0].id);
            }
          }
        });
      })
      .catch(() => {
        clearAuth();
        clearAppShellCache();
        router.replace('/login');
      });
  }, [router, mode, storeIdFromPath]);

  function logout() {
    clearAuth();
    clearAppShellCache();
    router.replace('/login');
  }

  function onStoreChange(id: string) {
    setStoreId(id);
    setCurrentStoreId(id);
    router.push(defaultStorePath(id, user!));
  }

  const activeStoreId = storeIdFromPath ?? storeId;

  if (!user || !sessionReady) {
    return (
      <div className="min-h-screen">
        <aside className="hidden border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col" />
        <main className="min-h-screen p-6 lg:ml-64">
          <PageLoader />
        </main>
      </div>
    );
  }

  const storeLinks = activeStoreId
    ? STORE_NAV_ITEMS.filter((item) => hasScreenPermission(user.role, user.permissions, item.screen)).map(
        (item) => ({
          href: buildStoreHref(activeStoreId, item.segment),
          label: item.label,
        }),
      )
    : [];

  const masterLinks = [
    { href: '/master/dashboard', label: 'Visão geral' },
    { href: '/master/stores', label: 'Lojas' },
    { href: '/master/users', label: 'Usuários' },
    { href: '/master/deliverers', label: 'Entregadores' },
    { href: '/master/settings', label: 'Minha conta' },
  ];

  const links =
    mode === 'master'
      ? masterLinks
      : [
          ...storeLinks,
          ...(activeStoreId && canManagePaymentMethods(user.role)
            ? [{ href: `/store/${activeStoreId}/settings/payment-methods`, label: 'Formas de pagamento' }]
            : []),
          ...(activeStoreId ? [{ href: `/store/${activeStoreId}/settings`, label: 'Minha conta' }] : []),
        ];

  return (
    <div className="min-h-screen">
      <aside className="border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col">
        <div className="border-b border-slate-200 p-4">
          <Logo size="sm" />
          <div className="mt-2 text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</div>
          <div className="text-sm font-medium">{user.name}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'store' && stores.length > 0 && (
            <select
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={activeStoreId ?? ''}
              onChange={(e) => onStoreChange(e.target.value)}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <nav className="space-y-1">
            {links.map((l) => (
              <NavLink key={l.href} href={l.href} active={pathname === l.href}>
                {l.label}
              </NavLink>
            ))}
            {user.role === 'ORG_MASTER' && mode === 'store' && (
              <NavLink href="/master/dashboard" active={pathname.startsWith('/master')}>
                Painel Master
              </NavLink>
            )}
          </nav>
        </div>
        <div className="border-t border-slate-200 p-4">
          <button onClick={logout} type="button" className="text-sm text-red-600 hover:underline">
            Sair
          </button>
        </div>
      </aside>
      <main className="min-h-screen p-6 lg:ml-64">{children}</main>
    </div>
  );
}
