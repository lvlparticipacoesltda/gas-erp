'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { DeliverersPanel } from '@/components/deliverers/deliverers-panel';

export default function MasterDeliverersPage() {
  return (
    <>
      <PageHeader
        title="Entregadores"
        subtitle="Cadastro, unidades atendidas e acesso ao aplicativo móvel"
        action={
          <Link
            href="/master/deliverers/map"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <MapPin className="h-4 w-4" />
            Ver mapa
          </Link>
        }
      />
      <DeliverersPanel showStoreFilter />
    </>
  );
}
