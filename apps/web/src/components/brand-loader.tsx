'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

const SIZES = { sm: 40, md: 64, lg: 80 } as const;

const LOADER_SRC = '/brand/app-icon.png';

function BrandLoaderIcon({ sizePx }: { sizePx: number }) {
  return (
    <div className="relative" style={{ width: sizePx, height: sizePx }}>
      <Image
        src={LOADER_SRC}
        alt=""
        width={sizePx}
        height={sizePx}
        aria-hidden
        className="absolute inset-0 object-contain opacity-[0.14]"
      />
      <div className="absolute inset-0 overflow-hidden">
        <div className="brand-loader-clip absolute bottom-0 h-full w-full">
          <Image
            src={LOADER_SRC}
            alt=""
            width={sizePx}
            height={sizePx}
            aria-hidden
            className="absolute bottom-0 left-0 object-contain drop-shadow-sm"
            style={{ width: sizePx, height: sizePx }}
          />
        </div>
      </div>
    </div>
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
  const sizePx = SIZES[size];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex flex-col items-center justify-center gap-5', className)}
    >
      <div className="brand-loader-shell relative">
        <BrandLoaderIcon sizePx={sizePx} />
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
