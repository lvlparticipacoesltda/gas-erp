'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Linha secundária opcional (detalhe do erro, por exemplo). */
  detail?: string;
}

/** Erro fica mais tempo: o usuário costuma precisar ler antes de reagir. */
const DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  error: 7000,
};

interface ToastApi {
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Confirmação efêmera de que a ação deu certo. Sem isso o sistema só falava
 * com o usuário quando algo dava errado — salvar parecia não ter acontecido.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return api;
}

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'border-emerald-200', iconColor: 'text-emerald-600' },
  error: { icon: AlertTriangle, ring: 'border-red-200', iconColor: 'text-red-600' },
  info: { icon: Info, ring: 'border-slate-200', iconColor: 'text-slate-500' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, detail?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message, detail }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[tone]),
      );
    },
    [dismiss],
  );

  // Timers pendentes morrem junto com o provider (evita setState em desmontado).
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, detail) => push('success', message, detail),
      error: (message, detail) => push('error', message, detail),
      info: (message, detail) => push('info', message, detail),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* `pointer-events-none` no container para não bloquear cliques na tela;
          cada card reativa o próprio. Ancorado embaixo à direita no desktop e
          preso ao rodapé no celular, acima da safe area. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-0 sm:items-end"
        role="region"
        aria-label="Notificações"
      >
        {toasts.map((toast) => {
          const { icon: Icon, ring, iconColor } = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
              className={cn(
                'ui-toast-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3 shadow-lg',
                ring,
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{toast.message}</p>
                {toast.detail && <p className="mt-0.5 text-xs text-slate-500">{toast.detail}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dispensar notificação"
                className="-m-1 shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
