'use client';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}

export type { PaginationBarProps };

function pageRange(page: number, pageSize: number, total: number) {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return { from, to };
}

const navButtonClass =
  'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  loading = false,
  onPageChange,
  className,
}: PaginationBarProps) {
  if (total === 0) return null;

  const { from, to } = pageRange(page, pageSize, total);

  function go(next: number) {
    if (loading || next < 1 || next > totalPages || next === page) return;
    onPageChange(next);
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 ${className ?? ''}`}
      aria-busy={loading}
    >
      <span>
        Exibindo <span className="font-medium text-slate-800">{from}–{to}</span> de{' '}
        <span className="font-medium text-slate-800">{total}</span>
        {' · '}
        <span className="text-slate-500">{pageSize} por página</span>
        {totalPages > 1 ? (
          <>
            {' · '}
            Página {page} de {totalPages}
          </>
        ) : null}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={navButtonClass}
            disabled={page <= 1 || loading}
            onClick={() => go(page - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            className={navButtonClass}
            disabled={page >= totalPages || loading}
            onClick={() => go(page + 1)}
          >
            Próxima
          </button>
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

export const DEFAULT_TABLE_PAGE_SIZE = 15;
