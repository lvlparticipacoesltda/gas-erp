'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { SchedulesPanel } from '@/components/schedules/schedules-panel';
import { refreshStoredUser } from '@/lib/api';
import { canManageSchedules, type AuthUser } from '@gas-erp/shared';

export default function StoreSchedulesPage() {
  const params = useParams();
  const storeId = String(params.storeId);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void refreshStoredUser().then((u) => setUser(u));
  }, []);

  if (!user) return <PageLoader label="Carregando…" />;

  const isAttendant = user.role === 'ATTENDANT';
  const canManage = canManageSchedules(user.role);

  return (
    <>
      <PageHeader
        title="Escalas de trabalho"
        subtitle={
          canManage
            ? 'Monte a escala da unidade e acompanhe o ponto'
            : 'Consulte a escala dos entregadores e bata seu ponto'
        }
        action={
          canManage ? (
            <Link
              href={`/store/${storeId}/schedules/ponto`}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Log de ponto
            </Link>
          ) : undefined
        }
      />
      <SchedulesPanel
        user={user}
        storeId={storeId}
        showPunchCard={isAttendant || canManage}
      />
    </>
  );
}
