'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { WeeklySchedulesPanel } from '@/components/schedules/weekly-schedules-panel';
import { refreshStoredUser } from '@/lib/api';
import { canAccessHorarios, type AuthUser } from '@gas-erp/shared';

export default function StoreWeeklySchedulesPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = String(params.storeId);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void refreshStoredUser().then((u) => {
      if (u && !canAccessHorarios(u.role, u.permissions)) {
        router.replace(`/store/${storeId}/schedules`);
        return;
      }
      setUser(u);
    });
  }, [router, storeId]);

  if (!user) return <PageLoader label="Carregando…" />;

  return (
    <>
      <PageHeader
        title="Horários"
        subtitle="Padrão semanal por pessoa — unidade na criação é a referência padrão; dias pontuais se ajustam na Escala"
        action={
          <Link
            href={`/store/${storeId}/schedules`}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Escalas de trabalho
          </Link>
        }
      />
      <WeeklySchedulesPanel user={user} storeId={storeId} />
    </>
  );
}
