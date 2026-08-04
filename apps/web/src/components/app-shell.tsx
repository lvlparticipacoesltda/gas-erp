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
import { defaultStorePath } from '@/lib/store-nav';
import { Logo } from '@/components/logo';
import { PageLoader } from '@/components/brand-loader';
import { NotificationsCenter } from '@/components/notifications/notifications-center';
import { MasterAccountMenu, MasterSidebarNav } from '@/components/master-sidebar-nav';
import { StoreAccountMenu, StoreSidebarNav } from '@/components/store-sidebar-nav';
import { ROLE_LABELS } from '@gas-erp/shared';
import type { AuthUser } from '@gas-erp/shared';

interface Store {
  id: string;
  name: string;
  code: string;
}

let cachedUser: AuthUser | null = null;
let cachedStores: Store[] | null = null;
let storesRequest: Promise<Store[]> | null = null;

function fetchStores(force = false): Promise<Store[]> {
  if (!force && cachedStores) return Promise.resolve(cachedStores);
  if (force || !storesRequest) {
    const token = getToken();
    storesRequest = api<Store[]>('/stores', {}, token).then((data) => {
      cachedStores = data;
      return data;
    });
  }
  return storesRequest;
}

/** Invalida o cache de lojas (ex.: após criar/editar/excluir uma loja no master). */
export function invalidateStoresCache() {
  cachedStores = null;
  storesRequest = null;
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

        return fetchStores().then(async (data) => {
          let list = data;
          // O cache de lojas pode estar desatualizado (ex.: loja recém-criada
          // que ainda não aparece na lista). Se a loja atual (da URL) não estiver
          // presente, recarrega do servidor antes de montar o seletor.
          if (
            mode === 'store' &&
            storeIdFromPath &&
            !list.some((s) => s.id === storeIdFromPath)
          ) {
            list = await fetchStores(true);
          }
          setStores(list);
          if (mode === 'store') {
            if (storeIdFromPath) {
              setStoreId(storeIdFromPath);
              setCurrentStoreId(storeIdFromPath);
            } else if (getCurrentStoreId() && list.some((s) => s.id === getCurrentStoreId())) {
              setStoreId(getCurrentStoreId());
            } else if (list[0]) {
              setStoreId(list[0].id);
              setCurrentStoreId(list[0].id);
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
    const token = getToken();
    clearAuth();
    clearAppShellCache();
    if (token) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
      void fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => undefined);
    }
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

  return (
    <div className="min-h-screen">
      <aside className="border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col">
        {/* Cabeçalho da barra lateral centralizado: a logo ocupa pouco mais da
            metade dos 16rem e encostada à esquerda deixava um vazio à direita. */}
        <div className="border-b border-slate-200 p-4 text-center">
          <Logo size="sm" className="items-center" />
          <div className="mt-2 text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</div>
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
          {mode === 'master' ? (
            <MasterSidebarNav />
          ) : activeStoreId ? (
            <StoreSidebarNav storeId={activeStoreId} user={user} />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">
          {mode === 'master' ? (
            <MasterAccountMenu userName={user.name} onLogout={logout} />
          ) : activeStoreId ? (
            <StoreAccountMenu
              storeId={activeStoreId}
              userName={user.name}
              onLogout={logout}
            />
          ) : (
            <button onClick={logout} type="button" className="text-sm text-red-600 hover:underline">
              Sair
            </button>
          )}
          <NotificationsCenter />
        </div>
      </aside>
      <main className="min-h-screen p-6 lg:ml-64">{children}</main>
    </div>
  );
}
