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
    // As margens negativas cancelam o `p-6` do AppShell só para a barra de
    // entregas encostar na borda; o `py-6 pr-6` devolve o respiro ao conteúdo.
    <div className="-my-6 -mr-6 flex min-h-[calc(100vh-3rem)] flex-col lg:min-h-[calc(100vh)] lg:flex-row">
      <div className="min-w-0 flex-1 overflow-x-auto py-6 pr-6">{children}</div>
      <DeliveriesSidebar storeId={storeId} className="lg:min-h-screen" />
    </div>
  );
}
