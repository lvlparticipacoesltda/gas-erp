'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

const BRAND = {
  laranja: '#FB5E13',
  brasa: '#E84B0B',
  chama: '#FF8A2B',
} as const;

const SIZES = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
} as const;

function BrandLoaderIcon({ className, clipId }: { className?: string; clipId: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('block', className)} aria-hidden>
      <defs>
        <linearGradient id={`${clipId}-grad`} x1="24" y1="48" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={BRAND.brasa} />
          <stop offset="45%" stopColor={BRAND.laranja} />
          <stop offset="100%" stopColor={BRAND.chama} />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="48" height="48" className="brand-loader-clip" />
        </clipPath>
      </defs>

      <g opacity="0.14">
        <rect width="48" height="48" rx="10.5" fill={BRAND.laranja} />
        <rect x="13.7" y="13.4" width="20.6" height="26.2" rx="10.3" fill="#FFFFFF" />
        <rect x="16.5" y="7.8" width="15" height="7" rx="3.5" fill="#FFFFFF" />
        <path
          d="M24 20.1c-2 3-3.4 5.1-3.4 7.6a3.4 3.4 0 1 0 6.8 0c0-2.5-1.4-4.6-3.4-7.6z"
          fill={BRAND.laranja}
        />
      </g>

      <g clipPath={`url(#${clipId})`}>
        <rect width="48" height="48" rx="10.5" fill={`url(#${clipId}-grad)`} />
        <rect x="13.7" y="13.4" width="20.6" height="26.2" rx="10.3" fill="#FFFFFF" />
        <rect x="16.5" y="7.8" width="15" height="7" rx="3.5" fill="#FFFFFF" />
        <path
          d="M24 20.1c-2 3-3.4 5.1-3.4 7.6a3.4 3.4 0 1 0 6.8 0c0-2.5-1.4-4.6-3.4-7.6z"
          fill={BRAND.laranja}
        />
      </g>
    </svg>
  );
}

export function BrandLoader({
  className,
  size = 'lg',
  label = 'Carregando…',
  showLabel = true,
}: {
  className?: string;
  size?: keyof typeof SIZES;
  label?: string;
  showLabel?: boolean;
}) {
  const clipId = useId().replace(/:/g, '');
  const dim = SIZES[size];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex flex-col items-center justify-center gap-5', className)}
    >
      <div className={cn('brand-loader-shell relative', dim)}>
        <BrandLoaderIcon className={cn('size-full drop-shadow-sm', dim)} clipId={clipId} />
      </div>
      {showLabel && label ? (
        <p className="text-sm font-medium text-slate-500">{label}</p>
      ) : null}
      <span className="sr-only">{label || 'Carregando'}</span>
    </div>
  );
}

/** Tela cheia — auth inicial, loading.tsx de rotas. */
export function BrandLoaderScreen({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <BrandLoader label={label} />
    </div>
  );
}

/** Área de conteúdo dentro do AppShell. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <BrandLoader label={label} />
    </div>
  );
}
