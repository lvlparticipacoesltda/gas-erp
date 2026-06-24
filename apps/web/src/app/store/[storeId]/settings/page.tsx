'use client';

import { AppShell } from '@/components/app-shell';
import { SettingsContent } from '@/components/settings-content';

export default function StoreSettingsPage() {
  return (
    <AppShell mode="store">
      <SettingsContent />
    </AppShell>
  );
}
