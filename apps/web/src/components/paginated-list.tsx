'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { LoadingOverlay } from '@/components/loading-overlay';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  Pagination,
  paginateSlice,
  totalPagesFor,
  type PaginationBarProps,
} from '@/components/pagination';

interface PaginatedListProps<T> {
  items: T[];
  pageSize?: number;
  /** Quando true (padrão), exibe seletor de itens por página. */
  showPageSize?: boolean;
  pageSizeOptions?: number[];
  emptyMessage?: string;
  children: (pageItems: T[]) => ReactNode;
}

export function PaginatedList<T>({
  items,
  pageSize: initialPageSize = DEFAULT_TABLE_PAGE_SIZE,
  showPageSize = true,
  pageSizeOptions,
  emptyMessage,
  children,
}: PaginatedListProps<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [isPending, startTransition] = useTransition();
  const totalPages = totalPagesFor(items.length, pageSize);
  const safePage = Math.min(page, totalPages);
  const pageItems = paginateSlice(items, safePage, pageSize);

  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize]);

  if (items.length === 0 && emptyMessage) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  const paginationProps: PaginationBarProps = {
    className: 'mt-3',
    page: safePage,
    totalPages,
    total: items.length,
    pageSize,
    loading: isPending,
    onPageChange: (next) => startTransition(() => setPage(next)),
    ...(showPageSize
      ? {
          pageSizeOptions,
          onPageSizeChange: (next) =>
            startTransition(() => {
              setPageSize(next);
              setPage(1);
            }),
        }
      : {}),
  };

  return (
    <>
      <LoadingOverlay loading={isPending} label="Carregando…" minHeight="min-h-[8rem]">
        {children(pageItems)}
      </LoadingOverlay>
      <Pagination {...paginationProps} />
    </>
  );
}

export { DEFAULT_TABLE_PAGE_SIZE };
