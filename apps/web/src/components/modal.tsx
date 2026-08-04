'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
} as const;

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
  /** Valor de `data-modal-focus` do elemento que deve receber o foco inicial. */
  initialFocus?: string;
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
  initialFocus,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Quem tinha o foco antes de abrir, para devolver no fechamento.
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // A maioria das telas passa `onClose={() => ...}`, que muda de identidade a
  // cada render. Se o efeito dependesse dele, ele rodaria de novo a cada
  // digitação: a limpeza devolvia o foco para fora e o modal ficava impossível
  // de usar pelo teclado. O ref mantém o efeito preso apenas ao `open`.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  const focusables = useCallback(
    () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    [],
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      // Prende o Tab dentro do modal: sem isso o teclado passeava pela página
      // atrás do overlay, que o usuário nem consegue ver.
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    // Foco direto, sem `requestAnimationFrame`: o efeito já roda depois do
    // commit (os filhos existem) e a rAF nem dispara em aba em segundo plano,
    // deixando o modal abrir sem foco algum.
    const wanted = initialFocusRef.current;
    const preferred = wanted
      ? panelRef.current?.querySelector<HTMLElement>(`[data-modal-focus="${wanted}"]`)
      : null;
    (preferred ?? focusables()[0] ?? panelRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, focusables]);

  if (!open) return null;

  return (
    <div
      className="ui-overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'ui-modal-enter flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl outline-none',
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
            <h2 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-m-1.5 shrink-0 rounded-lg p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
