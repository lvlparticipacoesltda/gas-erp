'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { LoadingOverlay } from '@/components/loading-overlay';
import { PaginatedSection } from '@/components/paginated-section';
import { Badge, Button, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch';
import { api, getStoredUser, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  canManageSales,
  canApproveMobileSales,
  formatSaleDateTimeLabel,
  formatDashboardDateRangeLabel,
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
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [backdateFilter, setBackdateFilter] = useState(false);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [useDateRange, setUseDateRange] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [delivererId, setDelivererId] = useState('');
  const [deliverers, setDeliverers] = useState<DelivererOption[]>([]);
  const currentUser = getStoredUser<{ role: string }>();
  const isManager = currentUser ? canManageSales(currentUser.role) : false;
  const canApproveMobile = currentUser ? canApproveMobileSales(currentUser.role) : false;

  const effectiveDateFrom = useDateRange ? dateFrom : filterDate;
  const effectiveDateTo = useDateRange ? dateTo : filterDate;

  const salesQuery = useMemo(() => {
    const params = new URLSearchParams({
      storeId,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (statusFilter) params.set('status', statusFilter);
    if (backdateFilter) params.set('backdatePending', 'true');
    if (mobileFilter) params.set('mobilePending', 'true');
    if (effectiveDateFrom || effectiveDateTo) {
      const from = effectiveDateFrom || effectiveDateTo;
      const to = effectiveDateTo || effectiveDateFrom;
      if (from === to) {
        params.set('date', from);
      } else {
        params.set('dateFrom', from);
        params.set('dateTo', to);
      }
    }
    if (delivererId) params.set('delivererId', delivererId);
    return params.toString();
  }, [
    storeId,
    page,
    statusFilter,
    backdateFilter,
    mobileFilter,
    effectiveDateFrom,
    effectiveDateTo,
    delivererId,
  ]);

  const activeDateLabel =
    effectiveDateFrom || effectiveDateTo
      ? formatDashboardDateRangeLabel(
          effectiveDateFrom || effectiveDateTo,
          effectiveDateTo || effectiveDateFrom,
        )
      : null;

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
  }, [statusFilter, backdateFilter, mobileFilter, filterDate, dateFrom, dateTo, useDateRange, delivererId, storeId]);

  const [salesPage, setSalesPage] = useState<PaginatedResponse<Sale> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const hasLoadedOnce = useRef(false);
  const loadGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadSales = useCallback(
    (mode: 'initial' | 'refresh' | 'poll' = 'refresh') => {
      if (!storeId) return;

      let generation = loadGeneration.current;
      if (mode !== 'poll') {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        generation = ++loadGeneration.current;
        setSalesPage(null);
        if (hasLoadedOnce.current) {
          setIsRefetching(true);
        } else {
          setLoading(true);
        }
      }

      const signal = mode !== 'poll' ? abortRef.current?.signal : undefined;

      api<PaginatedResponse<Sale>>(`/sales?${salesQuery}`, { signal }, getToken())
        .then((res) => {
          if (mode !== 'poll' && generation !== loadGeneration.current) return;
          setSalesPage(res);
          hasLoadedOnce.current = true;
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          if (mode !== 'poll' && generation !== loadGeneration.current) return;
        })
        .finally(() => {
          if (mode !== 'poll' && generation !== loadGeneration.current) return;
          setLoading(false);
          setIsRefetching(false);
        });
    },
    [storeId, salesQuery],
  );

  useEffect(() => {
    loadSales(hasLoadedOnce.current ? 'refresh' : 'initial');
    return () => abortRef.current?.abort();
  }, [loadSales]);

  useRealtimeRefetch(
    storeId ? { type: 'store', storeId } : null,
    () => loadSales('poll'),
    Boolean(storeId),
  );

  const sales = salesPage?.data ?? [];
  const totalPages = salesPage?.totalPages ?? 1;
  const total = salesPage?.total ?? 0;

  if (loading && !salesPage) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Histórico de vendas"
        subtitle="Consulte, filtre e acompanhe as vendas da unidade · atualização em tempo real"
        action={
          <Link href={`/store/${storeId}/sales/new`}>
            <Button>Nova venda</Button>
          </Link>
        }
      />

      <div className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {activeDateLabel ? (
          <div className="inline-flex items-center rounded-full bg-brand-muted px-3 py-1 text-xs font-medium text-brand-dark">
            Filtrando data: {activeDateLabel}
          </div>
        ) : (
          <div className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
            Mostrando todas as datas — selecione um dia para filtrar
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full max-w-sm">
            {useDateRange ? (
              <>
                <Label>Período</Label>
                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-600">De</span>
                    <Input
                      type="date"
                      className="min-h-11 border-slate-300 bg-slate-50 [color-scheme:light]"
                      value={dateFrom}
                      max={dateTo || todayDateKey()}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDateFrom(value);
                        if (dateTo && value > dateTo) setDateTo(value);
                      }}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-600">Até</span>
                    <Input
                      type="date"
                      className="min-h-11 border-slate-300 bg-slate-50 [color-scheme:light]"
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
                </div>
              </>
            ) : (
              <>
                <Label>Data da venda</Label>
                <Input
                  type="date"
                  className="mt-1 min-h-11 border-slate-300 bg-slate-50 [color-scheme:light]"
                  value={filterDate}
                  max={todayDateKey()}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">Deixe em branco para listar todas as datas</p>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setUseDateRange((current) => !current);
                setDateFrom('');
                setDateTo('');
                setFilterDate('');
              }}
              className="mt-2 text-xs font-medium text-brand hover:underline"
            >
              {useDateRange ? 'Usar apenas um dia' : 'Filtrar por período (de/até)'}
            </button>
          </div>
          <div className="w-full max-w-xs">
            <Label>Entregador</Label>
            <Select
              className="mt-1 min-h-11 border-slate-300 bg-slate-50"
              value={delivererId}
              onChange={(e) => setDelivererId(e.target.value)}
            >
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
              className="mt-1 min-h-11 border-slate-300 bg-slate-50"
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
        {(filterDate || dateFrom || dateTo || delivererId) && (
          <Button
            type="button"
            variant="secondary"
            className="mb-0.5"
            onClick={() => {
              setFilterDate('');
              setDateFrom('');
              setDateTo('');
              setDelivererId('');
            }}
          >
            Limpar data e entregador
          </Button>
        )}
        </div>
      </div>

      <LoadingOverlay loading={isRefetching} minHeight="min-h-[50vh]" label="Aplicando filtros…">
      <PaginatedSection
        loading={false}
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
      </LoadingOverlay>
    </>
  );
}
