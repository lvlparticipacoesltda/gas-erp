'use client';

import { Button } from '@/components/ui';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, totalPages, total, onPageChange, className }: PaginationProps) {
  if (total === 0) return null;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 ${className ?? ''}`}>
      <span>
        {total} registro{total === 1 ? '' : 's'}
        {totalPages > 1 ? ` · Página ${page} de ${totalPages}` : ''}
      </span>
      {totalPages > 1 && (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}

export function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPagesFor(count: number, pageSize: number): number {
  return Math.ceil(count / pageSize) || 1;
}
