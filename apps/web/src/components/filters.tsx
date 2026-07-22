import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Barra horizontal e compacta para agrupar filtros de uma tela. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Campo de filtro: rótulo pequeno acima do controle. */
export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <label htmlFor={htmlFor} className="mb-1 text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
