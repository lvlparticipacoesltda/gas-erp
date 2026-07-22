'use client';

import { SalesReportPanel } from '@/components/sales-report-panel';
import { PageHeader } from '@/components/ui';

export default function MasterReportsPage() {
  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="Vendas consolidadas de todas as unidades"
      />
      <SalesReportPanel master />
    </>
  );
}
