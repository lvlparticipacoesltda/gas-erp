'use client';

import { useEffect, useState } from 'react';
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

  return (
    <>
      <PageHeader
        title="Escalas de trabalho"
        subtitle={
          canManageSchedules(user.role)
            ? 'Monte a escala da unidade e acompanhe o ponto'
            : 'Consulte a escala dos entregadores e bata seu ponto'
        }
      />
      <SchedulesPanel
        user={user}
        storeId={storeId}
        showPunchCard={isAttendant || canManageSchedules(user.role)}
      />
    </>
  );
}
