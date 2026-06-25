import { cn } from '@/lib/utils';
import { GasCylinderIcon } from '@/components/brand/gas-cylinder-icon';

const SIZES = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
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

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex flex-col items-center justify-center gap-4', className)}
    >
      <div className={cn('relative', dim)}>
        <GasCylinderIcon variant="app" className={cn('absolute inset-0', dim, 'opacity-[0.12]')} />
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 overflow-hidden motion-safe:animate-brand-loader-fill',
            dim,
          )}
        >
          <div className={cn('relative', dim)}>
            <GasCylinderIcon variant="app" className={dim} />
            <div
              className="pointer-events-none absolute inset-0 opacity-50 motion-safe:animate-brand-loader-shimmer"
              style={{
                background:
                  'linear-gradient(105deg, transparent 20%, rgba(255,138,43,0.45) 50%, transparent 80%)',
              }}
              aria-hidden
            />
          </div>
        </div>
      </div>
      {showLabel && label ? (
        <p className="text-sm font-medium tracking-wide text-slate-500">{label}</p>
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
