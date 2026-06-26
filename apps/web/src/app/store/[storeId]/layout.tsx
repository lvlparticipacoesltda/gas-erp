'use client';

import { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getStoredUser } from '@/lib/api';
import { hasScreenPermission } from '@gas-erp/shared';
import type { AuthUser } from '@gas-erp/shared';
import { defaultStorePath, pathnameToStoreScreen } from '@/lib/store-nav';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const storeId = params.storeId as string;

  useEffect(() => {
    const user = getStoredUser<AuthUser>();
    if (!user) {
      router.replace('/login');
      return;
    }

    const screen = pathnameToStoreScreen(pathname, storeId);
    if (!screen) return;

    if (!hasScreenPermission(user.role, user.permissions, screen)) {
      router.replace(defaultStorePath(storeId, user));
    }
  }, [pathname, router, storeId]);

  return <AppShell mode="store">{children}</AppShell>;
}
