import Image from 'next/image';
import { cn } from '@/lib/utils';

const WORDMARK_WIDTH = { sm: 132, md: 200, lg: 280 } as const;
const MARK_SIZE = { sm: 32, md: 48, lg: 64 } as const;

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
  if (variant === 'icon') {
    const mark = MARK_SIZE[size];
    return (
      <Image
        src="/brand/gas-cylinder-mark.png"
        alt="Gás do Povo"
        width={mark}
        height={mark}
        className={cn('object-contain', className)}
      />
    );
  }

  const wordmarkSrc =
    variant === 'stacked' || onDark ? '/brand/logo-login-dark.png' : '/brand/logo-wordmark.png';
  const width = WORDMARK_WIDTH[size];

  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        variant === 'stacked' ? 'items-center text-center' : 'items-start',
        className,
      )}
    >
      <Image
        src={wordmarkSrc}
        alt="Gás do Povo"
        width={width}
        height={Math.round(width * 0.45)}
        className="h-auto max-w-full object-contain"
        style={{ width, height: 'auto' }}
        priority
      />
      {tagline ? (
        <p className={cn('text-xs font-normal', onDark ? 'text-white/70' : 'text-slate-500')}>
          {tagline}
        </p>
      ) : null}
    </div>
  );
}
