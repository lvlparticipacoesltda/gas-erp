'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { PaginatedSection } from '@/components/paginated-section';
import { Badge, Button, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { formatCurrency } from '@/lib/utils';
import {
  canManageSales,
  canApproveMobileSales,
  formatSaleDateTimeLabel,
  formatWaitTime,
  getElapsedWaitingSeconds,
  getRouteDurationSeconds,
  getSaleAttendantName,
  getSaleDelivererName,
  getSaleDisplayStatus,
  getWaitTimeSeconds,
  isBackdatedSale,
  isMobileOriginatedSale,
  SALE_STATUS_LABELS,
  todayDateKey,
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

interface DelivererOption {
  id: string;
  user: { name: string };
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [delivererId, setDelivererId] = useState('');
  const [deliverers, setDeliverers] = useState<DelivererOption[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const currentUser = getStoredUser<{ role: string }>();
  const isManager = currentUser ? canManageSales(currentUser.role) : false;
  const canApproveMobile = currentUser ? canApproveMobileSales(currentUser.role) : false;

  const salesQuery = useMemo(() => {
    const params = new URLSearchParams({
      storeId,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (statusFilter) params.set('status', statusFilter);
    if (backdateFilter) params.set('backdatePending', 'true');
    if (mobileFilter) params.set('mobilePending', 'true');
    if (dateFrom || dateTo) {
      const dateQuery = buildDashboardDateQuery(dateFrom || dateTo, dateTo || dateFrom);
      for (const part of dateQuery.split('&')) {
        const [key, value] = part.split('=');
        if (key && value) params.set(key, decodeURIComponent(value));
      }
    }
    if (delivererId) params.set('delivererId', delivererId);
    return params.toString();
  }, [storeId, page, statusFilter, backdateFilter, mobileFilter, dateFrom, dateTo, delivererId]);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    api<DelivererOption[]>(`/deliverers?storeId=${storeId}`, {}, getToken())
      .then((rows) => {
        if (!cancelled) setDeliverers(rows);
      })
      .catch(() => {
        if (!cancelled) setDeliverers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, backdateFilter, mobileFilter, dateFrom, dateTo, delivererId, storeId]);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    api<PaginatedResponse<Sale>>(`/sales?${salesQuery}`, {}, getToken())
      .then((res) => {
        setSales(res.data);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, [storeId, salesQuery]);

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
        <div className="w-full max-w-md">
          <Label>Período</Label>
          <div className="mt-1 flex min-w-0 gap-2">
            <Input
              type="date"
              className="min-w-0 flex-1"
              value={dateFrom}
              max={dateTo || todayDateKey()}
              onChange={(e) => {
                const value = e.target.value;
                setDateFrom(value);
                if (dateTo && value > dateTo) setDateTo(value);
              }}
            />
            <Input
              type="date"
              className="min-w-0 flex-1"
              value={dateTo}
              min={dateFrom || undefined}
              max={todayDateKey()}
              onChange={(e) => {
                const value = e.target.value;
                setDateTo(value);
                if (dateFrom && value < dateFrom) setDateFrom(value);
              }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">Deixe em branco para listar todas as datas</p>
        </div>
        <div className="w-full max-w-xs">
          <Label>Entregador</Label>
          <Select value={delivererId} onChange={(e) => setDelivererId(e.target.value)}>
            <option value="">Todos os entregadores</option>
            {deliverers.map((deliverer) => (
              <option key={deliverer.id} value={deliverer.id}>
                {deliverer.user.name}
              </option>
            ))}
          </Select>
        </div>
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
        {(dateFrom || dateTo || delivererId) && (
          <Button
            type="button"
            variant="secondary"
            className="mb-0.5"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setDelivererId('');
            }}
          >
            Limpar data e entregador
          </Button>
        )}
      </div>

      <PaginatedSection
        loading={loading}
        pagination={{
          className: 'mt-4',
          page,
          totalPages,
          total,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
        }}
      >
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
                <td className="p-3">{getSaleDelivererName(s) ?? '-'}</td>
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
      </PaginatedSection>
    </>
  );
}
