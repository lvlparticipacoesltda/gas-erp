'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';

/** Mantém URL antiga: log de ponto ficou em Usuários. */
export default function MasterTimeClockLogRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/master/users/ponto');
  }, [router]);

  return <PageLoader label="Redirecionando…" />;
}
