'use client';

import type { ReactNode } from 'react';
import { LoadingOverlay } from '@/components/loading-overlay';
import { Pagination, type PaginationBarProps } from '@/components/pagination';

export function PaginatedSection({
  loading = false,
  children,
  pagination,
  overlayMinHeight,
}: {
  loading?: boolean;
  children: ReactNode;
  pagination: PaginationBarProps;
  overlayMinHeight?: string;
}) {
  return (
    <>
      <LoadingOverlay
        loading={loading}
        label="Carregando…"
        minHeight={overlayMinHeight}
      >
        {children}
      </LoadingOverlay>
      <Pagination loading={loading} {...pagination} />
    </>
  );
}
