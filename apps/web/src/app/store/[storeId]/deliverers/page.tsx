'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Badge, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';

interface Deliverer {
  id: string;
  status: string;
  user: { name: string; email: string; phone?: string };
  store: { name: string };
}

export default function DeliverersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [deliveries, setDeliveries] = useState<unknown[]>([]);

  useEffect(() => {
    Promise.all([
      api<Deliverer[]>(`/deliverers?storeId=${storeId}`, {}, getToken()),
      api<unknown[]>(`/deliveries?storeId=${storeId}`, {}, getToken()),
    ]).then(([d, del]) => {
      setDeliverers(d);
      setDeliveries(del);
    });
  }, [storeId]);

  return (
    <AppShell mode="store">
      <PageHeader title="Entregadores" subtitle={`${deliveries.length} entregas ativas hoje`} />
      <Table>
        <thead className="bg-slate-50 text-left">
          <tr><th className="p-3">Nome</th><th className="p-3">Telefone</th><th className="p-3">Status</th><th className="p-3">Loja</th></tr>
        </thead>
        <tbody>
          {deliverers.map((d) => (
            <tr key={d.id} className="border-t border-slate-100">
              <td className="p-3">{d.user.name}</td>
              <td className="p-3">{d.user.phone ?? '-'}</td>
              <td className="p-3"><Badge tone={d.status === 'AVAILABLE' ? 'success' : 'warning'}>{d.status}</Badge></td>
              <td className="p-3">{d.store.name}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AppShell>
  );
}
