import { cn } from '@/lib/utils';

const BRAND = {
  laranja: '#FB5E13',
  brasa: '#E84B0B',
  chama: '#FF8A2B',
  carvao: '#1C140C',
  areia: '#F4EEE8',
} as const;

type Variant = 'mark' | 'app' | 'mono-white';

/** Botijão laranja com chama branca — conforme manual da marca. */
export function GasCylinderIcon({
  className,
  variant = 'mark',
}: {
  className?: string;
  variant?: Variant;
}) {
  if (variant === 'app') {
    return (
      <svg viewBox="0 0 48 48" className={cn('shrink-0', className)} aria-hidden>
        <rect width="48" height="48" rx="10.5" fill={BRAND.laranja} />
        <rect x="13.7" y="13.4" width="20.6" height="26.2" rx="10.3" fill="#FFFFFF" />
        <rect x="16.5" y="7.8" width="15" height="7" rx="3.5" fill="#FFFFFF" />
        <path
          d="M24 20.1c-2 3-3.4 5.1-3.4 7.6a3.4 3.4 0 1 0 6.8 0c0-2.5-1.4-4.6-3.4-7.6z"
          fill={BRAND.laranja}
        />
      </svg>
    );
  }

  const body = variant === 'mono-white' ? '#FFFFFF' : BRAND.laranja;
  const flame = variant === 'mono-white' ? BRAND.laranja : '#FFFFFF';

  return (
    <svg viewBox="0 0 48 48" className={cn('shrink-0', className)} aria-hidden>
      <rect x="13.4" y="14.4" width="21.2" height="27" rx="10.6" fill={body} />
      <rect x="16.3" y="8.2" width="15.4" height="7.7" rx="3.8" fill={body} />
      <path
        d="M24 21.1c-2 3-3.4 5.2-3.4 7.8a3.4 3.4 0 1 0 6.8 0c0-2.6-1.4-4.8-3.4-7.8z"
        fill={flame}
      />
    </svg>
  );
}

export { BRAND };
