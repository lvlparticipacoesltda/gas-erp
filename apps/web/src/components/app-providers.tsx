'use client';

import type { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { ToastProvider } from '@/components/toast';

/** Serviços de UI globais (avisos e confirmações) montados uma única vez. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
