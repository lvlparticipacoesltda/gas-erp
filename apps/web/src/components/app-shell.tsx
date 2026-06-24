'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, clearAuth, getCurrentStoreId, getStoredUser, getToken, setCurrentStoreId } from '@/lib/api';
import { buildStoreHref, STORE_NAV_ITEMS } from '@/lib/store-nav';
import { NavLink } from '@/components/ui';
import { hasScreenPermission, ROLE_LABELS } from '@gas-erp/shared';
import type { AuthUser } from '@gas-erp/shared';

interface Store {
  id: string;
  name: string;
  code: string;
}

export function AppShell({ children, mode }: { children: React.ReactNode; mode: 'master' | 'store' }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser<AuthUser>();
    if (!token || !stored) {
      router.replace('/login');
      return;
    }
    setUser(stored);
    api<Store[]>('/stores', {}, token).then((data) => {
      setStores(data);
      if (mode === 'store') {
        const fromPath = pathname.match(/^\/store\/([^/]+)/)?.[1];
        if (fromPath) {
          setStoreId(fromPath);
          setCurrentStoreId(fromPath);
        } else if (getCurrentStoreId() && data.some((s) => s.id === getCurrentStoreId())) {
          setStoreId(getCurrentStoreId());
        } else if (data[0]) {
          setStoreId(data[0].id);
          setCurrentStoreId(data[0].id);
        }
      }
    });
  }, [router, mode, pathname]);

  function logout() {
    clearAuth();
    router.replace('/login');
  }

  function onStoreChange(id: string) {
    setStoreId(id);
    setCurrentStoreId(id);
    router.push(`/store/${id}/dashboard`);
  }

  if (!user) return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;

  const storeLinks = storeId
    ? STORE_NAV_ITEMS.filter((item) => hasScreenPermission(user.role, user.permissions, item.screen)).map(
        (item) => ({
          href: buildStoreHref(storeId, item.segment),
          label: item.label,
        }),
      )
    : [];

  const masterLinks = [
    { href: '/master/dashboard', label: 'Visão geral' },
    { href: '/master/stores', label: 'Lojas' },
    { href: '/master/users', label: 'Usuários' },
    { href: '/master/go-to-store', label: 'Ir para loja' },
    { href: '/master/settings', label: 'Minha conta' },
  ];

  const links =
    mode === 'master'
      ? masterLinks
      : [
          ...storeLinks,
          ...(storeId ? [{ href: `/store/${storeId}/settings`, label: 'Minha conta' }] : []),
        ];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="w-full border-r border-slate-200 bg-white lg:min-h-screen lg:w-64">
        <div className="border-b border-slate-200 p-4">
          <div className="text-lg font-bold text-sky-700">Gas ERP</div>
          <div className="mt-1 text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</div>
          <div className="text-sm font-medium">{user.name}</div>
        </div>
        <div className="p-4">
          {mode === 'store' && stores.length > 0 && (
            <select
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={storeId ?? ''}
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
        <div className="p-4">
          <button onClick={logout} className="text-sm text-red-600 hover:underline">
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
