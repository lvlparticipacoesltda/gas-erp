'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
} as const;

const PIXEL = {
  sm: 40,
  md: 64,
  lg: 80,
} as const;

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
  const dim = SIZES[size];
  const px = PIXEL[size];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex flex-col items-center justify-center gap-5', className)}
    >
      <div className={cn('brand-loader-pulse relative', dim)}>
        <Image
          src="/brand/app-icon.png"
          alt=""
          width={px}
          height={px}
          priority
          aria-hidden
          className={cn('size-full object-contain drop-shadow-sm', dim)}
        />
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
