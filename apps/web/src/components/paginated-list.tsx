'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Pagination, paginateSlice, totalPagesFor } from '@/components/pagination';

const DEFAULT_TABLE_PAGE_SIZE = 15;

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
      {children(pageItems)}
      <Pagination
        className="mt-3"
        page={safePage}
        totalPages={totalPages}
        total={items.length}
        onPageChange={setPage}
      />
    </>
  );
}

export { DEFAULT_TABLE_PAGE_SIZE };
