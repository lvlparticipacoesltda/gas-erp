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
        // `py-1` amplia a área de toque e `-my-1` devolve a caixa ao tamanho
        // original: as células da tabela têm `vertical-align: top`, então o
        // padding sozinho descia o texto 4px em relação ao resto da linha.
        'rounded py-1 -my-1 font-medium transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline',
        tone === 'brand' && 'text-brand',
        tone === 'danger' && 'text-red-600',
        tone === 'muted' && 'text-slate-600',
      )}
    >
      {children}
    </button>
  );
}
