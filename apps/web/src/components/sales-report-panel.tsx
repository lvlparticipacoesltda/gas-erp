'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { LoadingOverlay } from '@/components/loading-overlay';
import { PaginatedList } from '@/components/paginated-list';
import { Button, Card, Input, Label, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { formatCurrency } from '@/lib/utils';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  SALE_STATUS_LABELS,
  SALE_STATUSES,
  formatWaitTime,
  todayDateKey,
  type SalesReportFilters,
  type SalesReportResponse,
  type SalesReportRow,
} from '@gas-erp/shared';
import { Download } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

interface DelivererOption {
  id: string;
  user: { name: string };
}

interface SalesFilterState extends SalesReportFilters {
  dateFrom: string;
  dateTo: string;
}

function defaultFilters(): SalesFilterState {
  const today = todayDateKey();
  return {
    dateFrom: today,
    dateTo: today,
    status: '',
    delivererId: '',
    customerSearch: '',
    paymentMethod: '',
  };
}

function formatDay(dateKey: string): string {
  return dateKey.split('-').reverse().join('/');
}

function buildSalesQuery(storeId: string, filters: SalesFilterState): string {
  const params = new URLSearchParams({ storeId });
  const dateQuery = buildDashboardDateQuery(filters.dateFrom, filters.dateTo);
  for (const part of dateQuery.split('&')) {
    const [key, value] = part.split('=');
    if (key && value) params.set(key, decodeURIComponent(value));
  }
  if (filters.status) params.set('status', filters.status);
  if (filters.delivererId) params.set('delivererId', filters.delivererId);
  if (filters.customerSearch?.trim()) params.set('customerSearch', filters.customerSearch.trim());
  if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
  return params.toString();
}

const BASE_TABLE_COLUMNS: { key: keyof SalesReportRow | 'actions'; label: string; className?: string }[] = [
  { key: 'saleDate', label: 'Data' },
  { key: 'createdAt', label: 'Criado em' },
  { key: 'saleId', label: 'ID venda', className: 'min-w-[8rem]' },
  { key: 'statusLabel', label: 'Status' },
  { key: 'channelLabel', label: 'Canal' },
  { key: 'customerName', label: 'Cliente' },
  { key: 'customerPhone', label: 'Telefone' },
  { key: 'attendantName', label: 'Atendente' },
  { key: 'delivererName', label: 'Entregador' },
  { key: 'deliveryAddress', label: 'Endereço', className: 'min-w-[14rem]' },
  { key: 'itemsSummary', label: 'Itens', className: 'min-w-[12rem]' },
  { key: 'deliveryFee', label: 'Taxa entrega' },
  { key: 'gasDoPovoBenefit', label: 'Gás do Povo' },
  { key: 'paymentSummary', label: 'Pagamento' },
  { key: 'total', label: 'Total' },
];

const FINANCIAL_TABLE_COLUMNS: { key: keyof SalesReportRow; label: string; className?: string }[] = [
  { key: 'totalCost', label: 'CMV' },
  { key: 'grossProfit', label: 'Lucro bruto' },
  { key: 'grossMarginPercent', label: 'Margem bruta %' },
  { key: 'totalProcessingFees', label: 'Taxas pagamento' },
  { key: 'netRevenue', label: 'Faturamento líquido' },
  { key: 'netProfit', label: 'Lucro líquido' },
  { key: 'netMarginPercent', label: 'Margem líquida %' },
];

const TAIL_TABLE_COLUMNS: { key: keyof SalesReportRow; label: string; className?: string }[] = [
  { key: 'deliveryStatusLabel', label: 'Status entrega' },
  { key: 'waitTimeLabel', label: 'Tempo até aceitar' },
  { key: 'routeDurationLabel', label: 'Tempo em rota' },
  { key: 'totalDeliveryTimeLabel', label: 'Tempo total da entrega' },
  { key: 'notes', label: 'Observações', className: 'min-w-[10rem]' },
];

function cellValue(row: SalesReportRow, key: keyof SalesReportRow): string {
  const value = row[key];
  if (value == null || value === '') return '—';
  if (key === 'saleDate') return formatDay(String(value));
  if (key === 'deliveryFee' || key === 'total' || key === 'totalCost' || key === 'grossProfit'
    || key === 'totalProcessingFees' || key === 'netRevenue' || key === 'netProfit') {
    return formatCurrency(Number(value));
  }
  if (key === 'grossMarginPercent' || key === 'netMarginPercent') return value != null ? `${value}%` : '—';
  if (key === 'gasDoPovoBenefit') return value ? 'Sim' : 'Não';
  return String(value);
}

export function SalesReportPanel({ storeId }: { storeId: string }) {
  const [draft, setDraft] = useState(defaultFilters);
  const [applied, setApplied] = useState(defaultFilters);
  const [deliverers, setDeliverers] = useState<DelivererOption[]>([]);
  const [data, setData] = useState<SalesReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
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
    let cancelled = false;
    setLoading(true);
    setError('');
    const query = buildSalesQuery(storeId, applied);
    api<SalesReportResponse>(`/reports/sales?${query}`, {}, getToken())
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar relatório');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, applied]);

  const handleSearch = useCallback(() => {
    setApplied({ ...draft });
  }, [draft]);

  const handleReset = useCallback(() => {
    const defaults = defaultFilters();
    setDraft(defaults);
    setApplied(defaults);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError('');
    try {
      const query = buildSalesQuery(storeId, applied);
      const res = await fetch(`${API_URL}/reports/export?type=sales&${query}&format=csv`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Não foi possível gerar o CSV.');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? 'relatorio-vendas.csv';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar CSV');
    } finally {
      setExporting(false);
    }
  }, [storeId, applied]);

  if (loading && !data) return <PageLoader label="Carregando relatório de vendas…" />;

  const isRefetching = loading && !!data;
  const showFinancial = data?.totalCost != null && data?.grossProfit != null;
  const tableColumns = showFinancial
    ? [...BASE_TABLE_COLUMNS, ...FINANCIAL_TABLE_COLUMNS, ...TAIL_TABLE_COLUMNS]
    : [...BASE_TABLE_COLUMNS, ...TAIL_TABLE_COLUMNS];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Relatório de vendas</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div className="min-w-0">
            <Label>
              Data <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1 flex min-w-0 gap-1.5">
              <Input
                type="date"
                className="min-w-0 flex-1"
                value={draft.dateFrom}
                max={draft.dateTo}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    dateFrom: e.target.value,
                    dateTo: e.target.value > prev.dateTo ? e.target.value : prev.dateTo,
                  }))
                }
              />
              <Input
                type="date"
                className="min-w-0 flex-1"
                value={draft.dateTo}
                min={draft.dateFrom}
                max={todayDateKey()}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    dateTo: e.target.value,
                    dateFrom: e.target.value < prev.dateFrom ? e.target.value : prev.dateFrom,
                  }))
                }
              />
            </div>
          </div>
          <div className="min-w-0">
            <Label>Status</Label>
            <Select
              className="mt-1 w-full"
              value={draft.status ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">Selecione</option>
              {SALE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SALE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0">
            <Label>Entregador</Label>
            <Select
              className="mt-1 w-full"
              value={draft.delivererId ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, delivererId: e.target.value }))}
            >
              <option value="">Todos</option>
              {deliverers.map((deliverer) => (
                <option key={deliverer.id} value={deliverer.id}>
                  {deliverer.user.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0">
            <Label>Cliente</Label>
            <Input
              className="mt-1"
              placeholder="Nome ou telefone"
              value={draft.customerSearch ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, customerSearch: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <Label>Forma de pagamento</Label>
            <Select
              className="mt-1 w-full"
              value={draft.paymentMethod ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, paymentMethod: e.target.value }))}
            >
              <option value="">Selecione</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleReset} disabled={loading}>
            Redefinir
          </Button>
          <Button type="button" onClick={handleSearch} disabled={loading}>
            Busca
          </Button>
        </div>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {data && (
        <>
          <div className={`grid gap-4 ${showFinancial ? 'md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8' : 'md:grid-cols-3'}`}>
            <Card>
              <div className="text-sm text-slate-500">Faturamento</div>
              <div className="text-2xl font-bold">{formatCurrency(data.totalRevenue)}</div>
            </Card>
            {showFinancial && (
              <>
                <Card>
                  <div className="text-sm text-slate-500">CMV</div>
                  <div className="text-2xl font-bold">{formatCurrency(data.totalCost!)}</div>
                </Card>
                <Card>
                  <div className="text-sm text-slate-500">Lucro bruto</div>
                  <div className="text-2xl font-bold">{formatCurrency(data.grossProfit!)}</div>
                </Card>
                <Card>
                  <div className="text-sm text-slate-500">Margem bruta</div>
                  <div className="text-2xl font-bold">
                    {data.grossMarginPercent != null ? `${data.grossMarginPercent}%` : '—'}
                  </div>
                </Card>
                <Card>
                  <div className="text-sm text-slate-500">Taxas pagamento</div>
                  <div className="text-2xl font-bold">{formatCurrency(data.totalProcessingFees ?? 0)}</div>
                </Card>
                <Card>
                  <div className="text-sm text-slate-500">Faturamento líquido</div>
                  <div className="text-2xl font-bold">{formatCurrency(data.netRevenue ?? 0)}</div>
                </Card>
                <Card>
                  <div className="text-sm text-slate-500">Lucro líquido</div>
                  <div className="text-2xl font-bold">{formatCurrency(data.netProfit ?? 0)}</div>
                </Card>
                <Card>
                  <div className="text-sm text-slate-500">Margem líquida</div>
                  <div className="text-2xl font-bold">
                    {data.netMarginPercent != null ? `${data.netMarginPercent}%` : '—'}
                  </div>
                </Card>
              </>
            )}
            <Card>
              <div className="text-sm text-slate-500">Vendas</div>
              <div className="text-2xl font-bold">{data.salesCount}</div>
            </Card>
            <Card>
              <div className="text-sm text-slate-500">Ticket médio</div>
              <div className="text-2xl font-bold">{formatCurrency(data.averageTicket)}</div>
            </Card>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Período · {data.date} · {data.rows.length} registro{data.rows.length === 1 ? '' : 's'}
            </p>
            <Button type="button" variant="secondary" onClick={handleExport} disabled={exporting || loading}>
              <Download className="mr-2 inline h-4 w-4" aria-hidden />
              {exporting ? 'Baixando…' : 'Baixar dados'}
            </Button>
          </div>

          {data.byDeliverer.length > 0 && (
            <>
              <h2 className="font-semibold text-slate-900">Por entregador</h2>
              <PaginatedList items={data.byDeliverer}>
                {(rows) => (
                  <Table>
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="p-3">Entregador</th>
                        <th className="p-3">Rotas realizadas</th>
                        <th className="p-3">Rotas canceladas</th>
                        <th className="p-3">Tempo médio até aceitar</th>
                        <th className="p-3">Tempo médio em rota</th>
                        <th className="p-3">Tempo médio total da entrega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((deliverer) => (
                        <tr key={deliverer.delivererId} className="border-t border-slate-100">
                          <td className="p-3">{deliverer.delivererName}</td>
                          <td className="p-3">{deliverer.completedCount}</td>
                          <td className="p-3">{deliverer.cancelledCount}</td>
                          <td className="p-3">{formatWaitTime(deliverer.avgWaitTimeSeconds)}</td>
                          <td className="p-3">{formatWaitTime(deliverer.avgRouteDurationSeconds)}</td>
                          <td className="p-3">{formatWaitTime(deliverer.avgTotalDeliveryTimeSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </PaginatedList>
            </>
          )}

          <LoadingOverlay loading={isRefetching} minHeight="min-h-[30vh]" label="Atualizando relatório…">
            {data.rows.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma venda encontrada com os filtros selecionados.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <PaginatedList items={data.rows} emptyMessage="">
                  {(rows) => (
                    <table className="min-w-max w-full text-xs">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          {tableColumns.map((col) => (
                            <th key={col.key} className={`whitespace-nowrap p-2 font-medium ${col.className ?? ''}`}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.saleId} className="border-t border-slate-100 hover:bg-slate-50/80">
                            {tableColumns.map((col) => (
                              <td
                                key={col.key}
                                className={`max-w-[16rem] truncate whitespace-nowrap p-2 text-slate-700 ${col.className ?? ''}`}
                                title={cellValue(row, col.key as keyof SalesReportRow)}
                              >
                                {cellValue(row, col.key as keyof SalesReportRow)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </PaginatedList>
              </div>
            )}
          </LoadingOverlay>
        </>
      )}
    </div>
  );
}
