import { cn } from '@/lib/utils';

const BRAND = {
  laranja: '#FB5E13',
  brasa: '#E84B0B',
  chama: '#FF8A2B',
  carvao: '#1C140C',
  areia: '#F4EEE8',
} as const;

type Variant = 'mark' | 'app' | 'mono-white';

/** Ícone do botijão — selo Gás do Povo. */
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
        <rect width="48" height="48" rx="11" fill={BRAND.laranja} />
        <rect x="14" y="14" width="20" height="26" rx="10" fill="#FFFFFF" />
        <rect x="17" y="9" width="14" height="7" rx="3.5" fill="#FFFFFF" />
        <path
          d="M24 22c-2.2 3.2-4 5.6-4 8.8a4 4 0 1 0 8 0c0-3.2-1.8-5.6-4-8.8z"
          fill={BRAND.laranja}
        />
      </svg>
    );
  }

  const fill = variant === 'mono-white' ? '#FFFFFF' : BRAND.laranja;
  const flame = variant === 'mono-white' ? BRAND.laranja : BRAND.areia;

  return (
    <svg viewBox="0 0 48 48" className={cn('shrink-0', className)} aria-hidden>
      <path
        fill={fill}
        fillRule="evenodd"
        d="M24 9c2.4 0 4.4 1.8 4.7 4.1h.3c4.4 0 8 3.6 8 8v18c0 4.4-3.6 8-8 8H19c-4.4 0-8-3.6-8-8V21.1c0-4.4 3.6-8 8-8h.3C18.6 10.8 20.6 9 24 9Zm0 13c-2.2 3.2-4 5.6-4 8.8a4 4 0 1 0 8 0c0-3.2-1.8-5.6-4-8.8Z"
      />
      {variant === 'mono-white' ? (
        <path
          d="M24 22c-2.2 3.2-4 5.6-4 8.8a4 4 0 1 0 8 0c0-3.2-1.8-5.6-4-8.8z"
          fill={flame}
        />
      ) : null}
    </svg>
  );
}

export { BRAND };
