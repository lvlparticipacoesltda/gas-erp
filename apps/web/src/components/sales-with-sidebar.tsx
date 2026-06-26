'use client';

import { DeliveriesSidebar } from '@/components/deliveries-sidebar';

export function SalesWithSidebar({
  storeId,
  children,
}: {
  storeId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="-my-6 -mr-6 flex min-h-[calc(100vh-3rem)] flex-col lg:min-h-[calc(100vh)] lg:flex-row">
      <div className="min-w-0 flex-1 overflow-auto">{children}</div>
      <DeliveriesSidebar storeId={storeId} className="lg:min-h-screen" />
    </div>
  );
}
