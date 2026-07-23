'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';

/** URL antiga: log de ponto voltou para Escalas. */
export default function MasterUsersTimeClockRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/master/schedules/ponto');
  }, [router]);

  return <PageLoader label="Redirecionando…" />;
}
