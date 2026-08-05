import { forwardRef, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Button({
  children,
  className,
  variant = 'primary',
  loading = false,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  /** Mostra spinner e trava o botão — evita duplo envio no clique ansioso. */
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        // `min-h-10` garante o alvo de toque mínimo mesmo com rótulo curto.
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-dark',
        variant === 'secondary' && 'border border-slate-200 bg-white hover:bg-slate-50',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const ALERT_TONES = {
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

/**
 * Mensagem fixa dentro da tela (erro de formulário, aviso de contexto).
 * `role="alert"` faz o leitor de tela anunciar — antes o texto aparecia em
 * silêncio para quem não enxerga a caixa vermelha.
 */
export function Alert({
  children,
  tone = 'error',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof ALERT_TONES;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-4 py-3 text-sm', ALERT_TONES[tone], className)}
    >
      {children}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white p-6 shadow-sm', className)}>{children}</div>;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return (
      <input
        ref={ref}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-muted disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        {...props}
      />
    );
  },
);

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-muted disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-slate-700">{children}</label>;
}

export function PageContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function NavLink({ href, children, active }: { href: string; children: ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block rounded-lg px-3 py-2 text-sm font-medium transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        active ? 'bg-brand-muted text-brand-dark' : 'text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </Link>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="table-scroll overflow-x-auto rounded-xl border border-slate-200 bg-white">
      {/* `className` serve a tabelas com colunas fixas, que precisam de
          `border-separate` para o `position: sticky` das células funcionar. */}
      <table className={cn('min-w-full text-sm', className)}>{children}</table>
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const tones = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  };
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', tones[tone])}>{children}</span>;
}
