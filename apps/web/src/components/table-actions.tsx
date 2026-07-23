'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Links de ação compactos no estilo de tabela operacional (Ver / Editar / Remover). */
export function TableActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-3 text-sm', className)}>
      {children}
    </div>
  );
}

export function TableAction({
  children,
  onClick,
  tone = 'brand',
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: 'brand' | 'danger' | 'muted';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'font-medium transition hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline',
        tone === 'brand' && 'text-brand',
        tone === 'danger' && 'text-red-600',
        tone === 'muted' && 'text-slate-600',
      )}
    >
      {children}
    </button>
  );
}
