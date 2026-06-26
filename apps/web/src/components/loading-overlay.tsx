'use client';

import type { ReactNode } from 'react';
import { BrandLoader } from '@/components/brand-loader';
import { cn } from '@/lib/utils';

interface LoadingOverlayProps {
  loading: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
  minHeight?: string;
}

export function LoadingOverlay({
  loading,
  children,
  className,
  label = 'Atualizando…',
  minHeight = 'min-h-[12rem]',
}: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {loading && (
        <div
          className={cn(
            'absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/75 backdrop-blur-[2px]',
            minHeight,
          )}
          aria-hidden={!loading}
        >
          <BrandLoader size="md" label={label} />
        </div>
      )}
      <div
        className={cn(
          'transition-opacity duration-200',
          loading && 'pointer-events-none opacity-50',
        )}
        aria-busy={loading}
      >
        {children}
      </div>
    </div>
  );
}
