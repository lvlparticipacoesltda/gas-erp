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
    <div className="-m-6 flex min-h-[calc(100vh-0px)] flex-col lg:flex-row">
      <div className="flex-1 overflow-auto p-6">{children}</div>
      <DeliveriesSidebar storeId={storeId} className="lg:min-h-screen" />
    </div>
  );
}
