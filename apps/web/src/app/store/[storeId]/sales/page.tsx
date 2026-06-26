'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { Pagination } from '@/components/pagination';
import { Badge, Button, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  canManageSales,
  canApproveMobileSales,
  formatSaleDateTimeLabel,
  formatWaitTime,
  getElapsedWaitingSeconds,
  getRouteDurationSeconds,
  getSaleAttendantName,
  getSaleDisplayStatus,
  getWaitTimeSeconds,
  isBackdatedSale,
  isMobileOriginatedSale,
  SALE_STATUS_LABELS,
  type PaginatedResponse,
} from '@gas-erp/shared';

interface Sale {
  id: string;
  createdAt: string;
  saleDate?: string;
  status: string;
  channel?: string;
  backdateApproval?: string;
  mobileApproval?: string;
  createdByDelivererId?: string | null;
  total: number | string;
  customer?: { name: string };
  attendant?: { name: string } | null;
  createdByDeliverer?: { user: { name: string } } | null;
  deliverer?: { user: { name: string } };
  delivery?: { status: string; startedAt?: string | null; completedAt?: string | null } | null;
}

const PAGE_SIZE = 20;

export default function SalesListPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [sales, setSales] = useState<Sale[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [backdateFilter, setBackdateFilter] = useState(false);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const currentUser = getStoredUser<{ role: string }>();
  const isManager = currentUser ? canManageSales(currentUser.role) : false;
  const canApproveMobile = currentUser ? canApproveMobileSales(currentUser.role) : false;

  useEffect(() => {
    setPage(1);
  }, [statusFilter, backdateFilter, mobileFilter, storeId]);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    const statusQuery = statusFilter ? `&status=${statusFilter}` : '';
    const backdateQuery = backdateFilter ? '&backdatePending=true' : '';
    const mobileQuery = mobileFilter ? '&mobilePending=true' : '';
    api<PaginatedResponse<Sale>>(
      `/sales?storeId=${storeId}&page=${page}&pageSize=${PAGE_SIZE}${statusQuery}${backdateQuery}${mobileQuery}`,
      {},
      getToken(),
    )
      .then((res) => {
        setSales(res.data);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, [storeId, statusFilter, backdateFilter, mobileFilter, page]);

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Histórico de vendas"
        subtitle="Consulte, filtre e acompanhe as vendas da unidade"
        action={
          <Link href={`/store/${storeId}/sales/new`}>
            <Button>Nova venda</Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="w-full max-w-xs">
          <Label>Status</Label>
          <Select
            value={
              mobileFilter
                ? '__mobile_pending__'
                : backdateFilter
                  ? '__backdate_pending__'
                  : statusFilter
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__mobile_pending__') {
                setMobileFilter(true);
                setBackdateFilter(false);
                setStatusFilter('');
              } else if (v === '__backdate_pending__') {
                setBackdateFilter(true);
                setMobileFilter(false);
                setStatusFilter('');
              } else {
                setMobileFilter(false);
                setBackdateFilter(false);
                setStatusFilter(v);
              }
            }}
          >
            <option value="">Todos os status</option>
            <option value="__mobile_pending__">Aguardando aprovação (app)</option>
            {isManager && (
              <option value="__backdate_pending__">Aguardando aprovação (retroativa)</option>
            )}
            {Object.entries(SALE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        {isManager && (
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={backdateFilter}
              onChange={(e) => setBackdateFilter(e.target.checked)}
              className="rounded border-slate-300 text-brand focus:ring-brand"
            />
            Só aguardando aprovação de data
          </label>
        )}
        {canApproveMobile && (
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={mobileFilter}
              onChange={(e) => setMobileFilter(e.target.checked)}
              className="rounded border-slate-300 text-brand focus:ring-brand"
            />
            Só aguardando aprovação (app)
          </label>
        )}
      </div>

      {loading && <p className="mb-3 text-sm text-slate-500">Carregando...</p>}

      <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Atendente</th>
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
              const attendantName = getSaleAttendantName(s);
              const fromMobile = isMobileOriginatedSale(s);
              const fromBackdate = isBackdatedSale(s);
              return (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">
                  <div>{formatSaleDateTimeLabel(s)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {fromMobile && <Badge tone="default">App entregador</Badge>}
                    {fromBackdate && <Badge tone="default">Data retroativa</Badge>}
                  </div>
                </td>
                <td className="p-3">{s.customer?.name ?? '-'}</td>
                <td className="p-3">
                  <div>{attendantName ?? '—'}</div>
                  {fromMobile && attendantName && (
                    <div className="mt-0.5 text-xs text-slate-500">via app</div>
                  )}
                  {fromBackdate && s.backdateApproval === 'PENDING' && (
                    <div className="mt-0.5 text-xs text-slate-500">aguardando gerente</div>
                  )}
                </td>
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
            {sales.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-sm text-slate-400">
                  Nenhuma venda encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </Table>

        <Pagination
          className="mt-4"
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
    </>
  );
}
