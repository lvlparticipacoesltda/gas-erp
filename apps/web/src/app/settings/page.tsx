'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentStoreId, getStoredUser } from '@/lib/api';
import type { AuthUser } from '@gas-erp/shared';

export default function SettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser<AuthUser>();
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN') {
      router.replace('/master/settings');
      return;
    }
    const storeId = getCurrentStoreId() ?? user.storeIds[0];
    if (storeId) router.replace(`/store/${storeId}/settings`);
    else router.replace('/login');
  }, [router]);

  return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;
}
