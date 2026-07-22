'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { LoadingOverlay } from '@/components/loading-overlay';
import { PaginatedSection } from '@/components/paginated-section';
import { Badge, Button, Input, PageHeader, Select, Table } from '@/components/ui';
import { FilterBar, FilterField } from '@/components/filters';
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch';
import { api, getStoredUser, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  canManageSales,
  canApproveMobileSales,
  formatSaleDateTimeLabel,
  getSaleListBusinessDayKey,
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
  const [filterDate, setFilterDate] = useState(todayDateKey);
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

  const filterFrom = effectiveDateFrom || effectiveDateTo;
  const filterTo = effectiveDateTo || effectiveDateFrom;
  const mismatchedSales =
    filterFrom && filterTo
      ? sales.filter((sale) => {
          const key = getSaleListBusinessDayKey(sale);
          return key < filterFrom || key > filterTo;
        })
      : [];

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

      <FilterBar>
        {useDateRange ? (
          <>
            <FilterField label="De">
              <Input
                type="date"
                className="w-40 [color-scheme:light]"
                value={dateFrom}
                max={dateTo || todayDateKey()}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateFrom(value);
                  if (dateTo && value > dateTo) setDateTo(value);
                }}
              />
            </FilterField>
            <FilterField label="Até">
              <Input
                type="date"
                className="w-40 [color-scheme:light]"
                value={dateTo}
                min={dateFrom || undefined}
                max={todayDateKey()}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateTo(value);
                  if (dateFrom && value < dateFrom) setDateFrom(value);
                }}
              />
            </FilterField>
          </>
        ) : (
          <FilterField label="Data da venda">
            <Input
              type="date"
              className="w-44 [color-scheme:light]"
              value={filterDate}
              max={todayDateKey()}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </FilterField>
        )}

        <FilterField label="Entregador">
          <Select
            className="w-48"
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
        </FilterField>

        <FilterField label="Status">
          <Select
            className="w-56"
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
        </FilterField>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setUseDateRange((current) => {
                const next = !current;
                const today = todayDateKey();
                if (next) {
                  setDateFrom(today);
                  setDateTo(today);
                  setFilterDate('');
                } else {
                  setFilterDate(today);
                  setDateFrom('');
                  setDateTo('');
                }
                return next;
              });
            }}
            className="text-xs font-medium text-brand hover:underline"
          >
            {useDateRange ? 'Filtrar por um dia' : 'Filtrar por período'}
          </button>
          {(filterDate !== todayDateKey() || dateFrom || dateTo || delivererId || statusFilter || useDateRange) && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setUseDateRange(false);
                setFilterDate(todayDateKey());
                setDateFrom('');
                setDateTo('');
                setDelivererId('');
                setStatusFilter('');
                setBackdateFilter(false);
                setMobileFilter(false);
              }}
            >
              Voltar para hoje
            </Button>
          )}
        </div>
      </FilterBar>

      {mismatchedSales.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          O servidor retornou {mismatchedSales.length} venda(s) fora do período filtrado.
          Faça o deploy da API mais recente ou recarregue a página.
        </p>
      )}

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
