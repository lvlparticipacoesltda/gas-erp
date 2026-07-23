'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { SchedulesPanel } from '@/components/schedules/schedules-panel';
import { api, getToken, refreshStoredUser } from '@/lib/api';
import type { AuthUser } from '@gas-erp/shared';

interface Store {
  id: string;
  name: string;
}

export default function MasterSchedulesPage() {
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
        title="Escalas de trabalho"
        subtitle="Cadastre a escala mensal de entregadores e atendentes por unidade"
        action={
          <Link
            href="/master/schedules/ponto"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cartão de ponto
          </Link>
        }
      />
      <SchedulesPanel
        user={user}
        stores={stores}
        showStoreFilter
        showRoleTabs
      />
    </>
  );
}
