import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Botijão da marca — PNG oficial em public/brand. */
export function GasCylinderIcon({
  className,
  variant = 'mark',
}: {
  className?: string;
  variant?: 'mark' | 'app' | 'mono-white';
}) {
  const src = variant === 'app' ? '/icon.png' : '/brand/gas-cylinder-mark.png';

  return (
    <Image
      src={src}
      alt=""
      width={48}
      height={48}
      aria-hidden
      className={cn('h-auto w-auto object-contain', className)}
    />
  );
}
