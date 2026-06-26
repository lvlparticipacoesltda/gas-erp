'use client';

import { useParams } from 'next/navigation';
import { SalesWithSidebar } from '@/components/sales-with-sidebar';

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const { storeId } = useParams<{ storeId: string }>();
  if (!storeId) return children;
  return <SalesWithSidebar storeId={storeId}>{children}</SalesWithSidebar>;
}
