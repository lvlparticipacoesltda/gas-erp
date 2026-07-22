'use client';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  /** Quando informado, exibe seletor de itens por página. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export type { PaginationBarProps };

export const DEFAULT_TABLE_PAGE_SIZE = 15;
export const TABLE_PAGE_SIZE_OPTIONS = [15, 25, 50, 100] as const;

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
  onPageSizeChange,
  pageSizeOptions = [...TABLE_PAGE_SIZE_OPTIONS],
  className,
}: PaginationBarProps) {
  if (total === 0) return null;

  const { from, to } = pageRange(page, pageSize, total);
  const sizeOptions = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

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
        {totalPages > 1 ? (
          <>
            {' · '}
            Página {page} de {totalPages}
          </>
        ) : null}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-slate-600">
            <span className="whitespace-nowrap text-slate-500">Por página</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 outline-none hover:bg-slate-50 focus:border-brand focus:ring-2 focus:ring-brand-muted disabled:cursor-not-allowed disabled:opacity-40"
              value={pageSize}
              disabled={loading}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Itens por página"
            >
              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        {totalPages > 1 && (
          <>
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
          </>
        )}
      </div>
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
