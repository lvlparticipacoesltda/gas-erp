'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { TimeClockLogPanel } from '@/components/schedules/time-clock-log-panel';
import { refreshStoredUser } from '@/lib/api';
import type { AuthUser } from '@gas-erp/shared';

export default function StoreTimeClockLogPage() {
  const params = useParams();
  const storeId = String(params.storeId);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void refreshStoredUser().then((u) => setUser(u));
  }, []);

  if (!user) return <PageLoader label="Carregando…" />;

  return (
    <>
      <PageHeader
        title="Cartão de ponto"
        subtitle="Compare batidas de entrada/saída com a escala da unidade"
        action={
          <Link
            href={`/store/${storeId}/schedules`}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Escalas
          </Link>
        }
      />
      <TimeClockLogPanel
        user={user}
        storeId={storeId}
        backHref={`/store/${storeId}/schedules`}
      />
    </>
  );
}
