'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { SALE_STATUS_LABELS } from '@gas-erp/shared';

interface Sale {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  customer?: { name: string };
  deliverer?: { user: { name: string } };
}

export default function SalesListPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    api<{ data: Sale[] }>(`/sales?storeId=${storeId}`, {}, getToken()).then((r) => setSales(r.data));
  }, [storeId]);

  return (
    <AppShell mode="store">
      <PageHeader
        title="Histórico de vendas"
        action={<Link href={`/store/${storeId}/sales/new`}><Button>Nova venda</Button></Link>}
      />
      <Table>
        <thead className="bg-slate-50 text-left">
          <tr><th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Entregador</th><th className="p-3">Status</th><th className="p-3">Total</th></tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id} className="border-t border-slate-100">
              <td className="p-3">{formatDate(s.createdAt)}</td>
              <td className="p-3">{s.customer?.name ?? '-'}</td>
              <td className="p-3">{s.deliverer?.user.name ?? '-'}</td>
              <td className="p-3"><Badge>{SALE_STATUS_LABELS[s.status] ?? s.status}</Badge></td>
              <td className="p-3">{formatCurrency(s.total)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AppShell>
  );
}
