'use client';

import { PageHeader } from '@/components/ui';
import { DeliverersPanel } from '@/components/deliverers/deliverers-panel';

export default function MasterDeliverersPage() {
  return (
    <>
      <PageHeader
        title="Entregadores"
        subtitle="Cadastro, unidades atendidas e acesso ao aplicativo móvel"
      />
      <DeliverersPanel showStoreFilter />
    </>
  );
}
