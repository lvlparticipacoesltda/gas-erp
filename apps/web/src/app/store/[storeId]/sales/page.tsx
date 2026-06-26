'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { SalesWithSidebar } from '@/components/sales-with-sidebar';
import { Badge, Button, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatWaitTime, getElapsedWaitingSeconds, getRouteDurationSeconds, getSaleDisplayStatus, getWaitTimeSeconds, SALE_STATUS_LABELS } from '@gas-erp/shared';

interface Sale {
  id: string;
  createdAt: string;
  status: string;
  total: number | string;
  customer?: { name: string };
  deliverer?: { user: { name: string } };
  delivery?: { status: string; startedAt?: string | null; completedAt?: string | null } | null;
}

export default function SalesListPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [sales, setSales] = useState<Sale[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [ready, setReady] = useState(false);

  async function load() {
    const query = statusFilter ? `&status=${statusFilter}` : '';
    const res = await api<{ data: Sale[] }>(`/sales?storeId=${storeId}${query}`, {}, getToken());
    setSales(res.data);
  }

  useEffect(() => {
    load().finally(() => setReady(true));
  }, [storeId, statusFilter]);

  if (!ready) {
    return <PageLoader />;
  }

  return (
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
              <th className="p-3">Espera p/ rota</th>
              <th className="p-3">Tempo em rota</th>
              <th className="p-3">Status</th>
              <th className="p-3">Total</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => {
              const display = getSaleDisplayStatus(s);
              return (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">{formatDate(s.createdAt)}</td>
                <td className="p-3">{s.customer?.name ?? '-'}</td>
                <td className="p-3">{s.deliverer?.user.name ?? '-'}</td>
                <td className="p-3">
                  {s.delivery?.startedAt
                    ? formatWaitTime(getWaitTimeSeconds(s.createdAt, s.delivery.startedAt))
                    : '—'}
                </td>
                <td className="p-3">
                  {s.delivery?.startedAt
                    ? formatWaitTime(
                        getRouteDurationSeconds(s.delivery.startedAt, s.delivery.completedAt)
                          ?? (s.delivery.status === 'IN_PROGRESS'
                            ? getElapsedWaitingSeconds(s.delivery.startedAt)
                            : null),
                      )
                    : '—'}
                </td>
                <td className="p-3">
                  <Badge tone={display.tone}>
                    {display.label}
                  </Badge>
                </td>
                <td className="p-3">{formatCurrency(s.total)}</td>
                <td className="p-3 text-right">
                  <Link href={`/store/${storeId}/sales/${s.id}`}>
                    <Button type="button" variant="secondary">Ver / editar</Button>
                  </Link>
                </td>
              </tr>
            );})}
          </tbody>
        </Table>
      </SalesWithSidebar>
  );
}
