'use client';

import { AppShell } from '@/components/app-shell';

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return <AppShell mode="master">{children}</AppShell>;
}
