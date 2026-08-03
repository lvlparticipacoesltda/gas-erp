'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
} as const;

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Modal centralizado com fundo escurecido (esc fecha; clique no overlay fecha). */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl',
          SIZES[size],
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Faixa da marca no topo. Sem raio próprio: quem arredonda é o
            `overflow-hidden` do modal, senão a curva de 12px estoura numa
            faixa de 4px e vaza pelos cantos. */}
        <div aria-hidden className="h-1 shrink-0 bg-brand" />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
