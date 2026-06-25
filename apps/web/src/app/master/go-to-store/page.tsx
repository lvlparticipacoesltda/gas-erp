'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Card, PageHeader } from '@/components/ui';
import { api, getToken, setCurrentStoreId } from '@/lib/api';

interface Store {
  id: string;
  name: string;
  code: string;
  city?: string;
}

export default function GoToStorePage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    api<Store[]>('/stores', {}, getToken()).then(setStores);
  }, []);

  function enterStore(id: string) {
    setCurrentStoreId(id);
    router.push(`/store/${id}/dashboard`);
  }

  return (
    <AppShell mode="master">
      <PageHeader title="Ir para loja" subtitle="Selecione a unidade que deseja operar" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stores.map((store) => (
          <button
            key={store.id}
            type="button"
            onClick={() => enterStore(store.id)}
            className="text-left transition hover:scale-[1.01]"
          >
            <Card className="cursor-pointer hover:border-brand-light hover:shadow-md">
              <div className="text-lg font-semibold text-slate-900">{store.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                {store.code}
                {store.city ? ` · ${store.city}` : ''}
              </div>
              <div className="mt-3 text-sm font-medium text-brand">Abrir painel da loja →</div>
            </Card>
          </button>
        ))}
      </div>
    </AppShell>
  );
}
