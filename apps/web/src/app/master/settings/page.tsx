'use client';

import { AppShell } from '@/components/app-shell';
import { SettingsContent } from '@/components/settings-content';

export default function MasterSettingsPage() {
  return (
    <AppShell mode="master">
      <SettingsContent />
    </AppShell>
  );
}
