'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { LoadingOverlay } from '@/components/loading-overlay';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  Pagination,
  paginateSlice,
  totalPagesFor,
} from '@/components/pagination';

interface PaginatedListProps<T> {
  items: T[];
  pageSize?: number;
  emptyMessage?: string;
  children: (pageItems: T[]) => ReactNode;
}

export function PaginatedList<T>({
  items,
  pageSize = DEFAULT_TABLE_PAGE_SIZE,
  emptyMessage,
  children,
}: PaginatedListProps<T>) {
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const totalPages = totalPagesFor(items.length, pageSize);
  const safePage = Math.min(page, totalPages);
  const pageItems = paginateSlice(items, safePage, pageSize);

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  if (items.length === 0 && emptyMessage) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      <LoadingOverlay loading={isPending} label="Carregando…" minHeight="min-h-[8rem]">
        {children(pageItems)}
      </LoadingOverlay>
      <Pagination
        className="mt-3"
        page={safePage}
        totalPages={totalPages}
        total={items.length}
        pageSize={pageSize}
        loading={isPending}
        onPageChange={(next) => startTransition(() => setPage(next))}
      />
    </>
  );
}

export { DEFAULT_TABLE_PAGE_SIZE };
