'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { SalesWithSidebar } from '@/components/sales-with-sidebar';
import { Badge, Button, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { SALE_STATUS_LABELS } from '@gas-erp/shared';

interface Sale {
  id: string;
  createdAt: string;
  status: string;
  total: number | string;
  customer?: { name: string };
  deliverer?: { user: { name: string } };
}

export default function SalesListPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [sales, setSales] = useState<Sale[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    const query = statusFilter ? `&status=${statusFilter}` : '';
    const res = await api<{ data: Sale[] }>(`/sales?storeId=${storeId}${query}`, {}, getToken());
    setSales(res.data);
  }

  useEffect(() => {
    load();
  }, [storeId, statusFilter]);

  return (
    <AppShell mode="store">
      <SalesWithSidebar storeId={storeId}>
        <PageHeader
          title="Histórico de vendas"
          action={<Link href={`/store/${storeId}/sales/new`}><Button>Nova venda</Button></Link>}
        />

        <div className="mb-4 max-w-xs">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(SALE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>

        <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Entregador</th>
              <th className="p-3">Status</th>
              <th className="p-3">Total</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">{formatDate(s.createdAt)}</td>
                <td className="p-3">{s.customer?.name ?? '-'}</td>
                <td className="p-3">{s.deliverer?.user.name ?? '-'}</td>
                <td className="p-3">
                  <Badge tone={s.status === 'DELIVERED' ? 'success' : s.status === 'CANCELLED' ? 'danger' : s.status === 'IN_DELIVERY' ? 'warning' : 'default'}>
                    {SALE_STATUS_LABELS[s.status] ?? s.status}
                  </Badge>
                </td>
                <td className="p-3">{formatCurrency(s.total)}</td>
                <td className="p-3 text-right">
                  <Link href={`/store/${storeId}/sales/${s.id}`}>
                    <Button type="button" variant="secondary">Ver / editar</Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SalesWithSidebar>
    </AppShell>
  );
}
