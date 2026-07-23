'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { TimeClockLogPanel } from '@/components/schedules/time-clock-log-panel';
import { api, getToken, refreshStoredUser } from '@/lib/api';
import type { AuthUser } from '@gas-erp/shared';

interface Store {
  id: string;
  name: string;
}

export default function MasterTimeClockLogPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    void refreshStoredUser().then((u) => setUser(u));
    void api<Store[]>('/stores', {}, getToken()).then(setStores).catch(() => setStores([]));
  }, []);

  if (!user) return <PageLoader label="Carregando…" />;

  return (
    <>
      <PageHeader
        title="Cartão de ponto"
        subtitle="Consulta e exportação por colaborador"
        action={
          <Link
            href="/master/schedules"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Escalas
          </Link>
        }
      />
      <TimeClockLogPanel
        user={user}
        stores={stores}
        showStoreFilter
        showRoleTabs
        backHref="/master/schedules"
      />
    </>
  );
}
