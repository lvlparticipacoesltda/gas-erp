import { cn } from '@/lib/utils';

export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-16 w-16' };
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg
        viewBox="0 0 48 48"
        className={cn(sizes[size], 'shrink-0')}
        aria-hidden
      >
        <rect x="14" y="8" width="20" height="32" rx="10" fill="#0284c7" />
        <rect x="18" y="4" width="12" height="6" rx="3" fill="#0369a1" />
        <circle cx="24" cy="26" r="6" fill="#e0f2fe" />
        <path
          d="M24 20c-2 3-4 5-4 8a4 4 0 1 0 8 0c0-3-2-5-4-8z"
          fill="#f97316"
        />
      </svg>
      <div>
        <div className="text-xl font-bold leading-tight text-slate-900">Gas ERP</div>
        <div className="text-xs text-slate-500">Gestão para distribuidoras</div>
      </div>
    </div>
  );
}
