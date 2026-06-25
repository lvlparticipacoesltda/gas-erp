import { cn } from '@/lib/utils';
import { GasCylinderIcon } from '@/components/brand/gas-cylinder-icon';

export function Logo({
  className,
  size = 'md',
  variant = 'horizontal',
  onDark = false,
  tagline,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'horizontal' | 'stacked' | 'icon';
  onDark?: boolean;
  tagline?: string;
}) {
  const iconSizes = { sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-16 w-16' };
  const titleSizes = { sm: 'text-base', md: 'text-xl', lg: 'text-2xl' };

  if (variant === 'icon') {
    return <GasCylinderIcon variant="app" className={cn(iconSizes[size], className)} />;
  }

  const textMain = onDark ? 'text-white' : 'text-coal';
  const textAccent = onDark ? 'text-white/90' : 'text-coal/80';

  const wordmark = (
    <div className={cn(variant === 'stacked' && 'text-center')}>
      <div className={cn('font-extrabold lowercase leading-none tracking-tight', titleSizes[size], textMain)}>
        gás
      </div>
      <div
        className={cn(
          'mt-0.5 text-[0.55em] font-semibold uppercase tracking-[0.22em]',
          textAccent,
        )}
      >
        do povo
      </div>
      {tagline ? (
        <div className={cn('mt-1 text-xs font-normal normal-case tracking-normal', onDark ? 'text-white/70' : 'text-slate-500')}>
          {tagline}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        'flex items-center gap-3',
        variant === 'stacked' && 'flex-col gap-2 text-center',
        className,
      )}
    >
      <GasCylinderIcon variant="mark" className={iconSizes[size]} />
      {wordmark}
    </div>
  );
}
