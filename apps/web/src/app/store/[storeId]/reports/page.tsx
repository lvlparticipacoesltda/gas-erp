'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { DailySummaryDateFilter } from '@/components/daily-summary-date-filter';
import { LoadingOverlay } from '@/components/loading-overlay';
import { PaginatedList } from '@/components/paginated-list';
import { Button, Card, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  formatWaitTime,
  todayDateKey,
  type PurchasesReportResponse,
  type ReportType,
  type SalesReportResponse,
  type StockReportResponse,
} from '@gas-erp/shared';

type Tab = ReportType;

const TABS: { key: Tab; label: string }[] = [
  { key: 'sales', label: 'Vendas' },
  { key: 'purchases', label: 'Compras' },
  { key: 'stock', label: 'Estoque' },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

function formatDay(dateKey: string): string {
  return dateKey.split('-').reverse().join('/');
}

export default function ReportsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [tab, setTab] = useState<Tab>('sales');
  const [dateFrom, setDateFrom] = useState(todayDateKey);
  const [dateTo, setDateTo] = useState(todayDateKey);

  const [sales, setSales] = useState<SalesReportResponse | null>(null);
  const [purchases, setPurchases] = useState<PurchasesReportResponse | null>(null);
  const [stock, setStock] = useState<StockReportResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const query = buildDashboardDateQuery(dateFrom, dateTo);
    const path =
      tab === 'sales'
        ? `/reports/sales?storeId=${storeId}&${query}`
        : tab === 'purchases'
          ? `/reports/purchases?storeId=${storeId}&${query}`
          : `/reports/stock?storeId=${storeId}&${query}`;

    api<SalesReportResponse | PurchasesReportResponse | StockReportResponse>(path, {}, getToken())
      .then((data) => {
        if (cancelled) return;
        if (tab === 'sales') setSales(data as SalesReportResponse);
        else if (tab === 'purchases') setPurchases(data as PurchasesReportResponse);
        else setStock(data as StockReportResponse);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar relatório');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, tab, dateFrom, dateTo]);

  const handleExport = useCallback(async () => {
    if (!storeId) return;
    setExporting(true);
    setError('');
    try {
      const query = buildDashboardDateQuery(dateFrom, dateTo);
      const res = await fetch(
        `${API_URL}/reports/export?type=${tab}&storeId=${storeId}&${query}&format=csv`,
        { headers: { Authorization: `Bearer ${getToken() ?? ''}` }, cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Não foi possível gerar o CSV.');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `relatorio-${tab}.csv`;
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
  }, [storeId, tab, dateFrom, dateTo]);

  const current =
    tab === 'sales' ? sales : tab === 'purchases' ? purchases : stock;
  const isRefetching = loading && !!current;

  if (loading && !current) return <PageLoader label="Carregando relatórios…" />;

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle={current?.date ? `Período · ${current.date}` : 'Vendas, compras e estoque'}
        action={
          <Button type="button" onClick={handleExport} disabled={exporting || loading}>
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>
        }
      />

      <DailySummaryDateFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        disabled={loading}
        onChange={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
        }}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t.key
                ? 'bg-brand text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <LoadingOverlay loading={isRefetching} minHeight="min-h-[40vh]" label="Atualizando relatório…">
        {tab === 'sales' && sales && <SalesReport data={sales} />}
        {tab === 'purchases' && purchases && <PurchasesReport data={purchases} />}
        {tab === 'stock' && stock && <StockReport data={stock} />}
      </LoadingOverlay>
    </>
  );
}

function SalesReport({ data }: { data: SalesReportResponse }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card><div className="text-sm text-slate-500">Faturamento</div><div className="text-2xl font-bold">{formatCurrency(data.totalRevenue)}</div></Card>
        <Card><div className="text-sm text-slate-500">Vendas</div><div className="text-2xl font-bold">{data.salesCount}</div></Card>
        <Card><div className="text-sm text-slate-500">Ticket médio</div><div className="text-2xl font-bold">{formatCurrency(data.averageTicket)}</div></Card>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Por status</h2>
      {data.byStatus.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma venda no período.</p>
      ) : (
        <PaginatedList items={data.byStatus}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left"><tr><th className="p-3">Status</th><th className="p-3">Qtd</th><th className="p-3">Total</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.status} className="border-t border-slate-100"><td className="p-3">{s.label}</td><td className="p-3">{s.count}</td><td className="p-3">{formatCurrency(s.total)}</td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Por dia</h2>
      {data.byDay.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma venda no período.</p>
      ) : (
        <PaginatedList items={data.byDay}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left"><tr><th className="p-3">Data</th><th className="p-3">Vendas</th><th className="p-3">Faturamento</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.date} className="border-t border-slate-100"><td className="p-3">{formatDay(d.date)}</td><td className="p-3">{d.count}</td><td className="p-3">{formatCurrency(d.total)}</td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Por forma de pagamento</h2>
      {data.byPaymentMethod.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum pagamento no período.</p>
      ) : (
        <PaginatedList items={data.byPaymentMethod}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left"><tr><th className="p-3">Forma</th><th className="p-3">Valor</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.method} className="border-t border-slate-100"><td className="p-3">{p.label}</td><td className="p-3">{formatCurrency(p.total)}</td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}

      {data.byDeliverer.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">Por entregador</h2>
          <PaginatedList items={data.byDeliverer}>
            {(rows) => (
              <Table>
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-3">Entregador</th>
                    <th className="p-3">Entregas</th>
                    <th className="p-3">Média até a rota</th>
                    <th className="p-3">Média em rota</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.delivererId} className="border-t border-slate-100">
                      <td className="p-3">{d.delivererName}</td>
                      <td className="p-3">{d.deliveryCount}</td>
                      <td className="p-3">{formatWaitTime(d.avgWaitTimeSeconds)}</td>
                      <td className="p-3">{formatWaitTime(d.avgRouteDurationSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </PaginatedList>
        </>
      )}
    </>
  );
}

function PurchasesReport({ data }: { data: PurchasesReportResponse }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card><div className="text-sm text-slate-500">Total de compras</div><div className="text-2xl font-bold">{formatCurrency(data.totalPurchases)}</div></Card>
        <Card><div className="text-sm text-slate-500">Notas</div><div className="text-2xl font-bold">{data.invoiceCount}</div></Card>
        <Card><div className="text-sm text-slate-500">A pagar no período</div><div className="text-2xl font-bold">{formatCurrency(data.payablesTotal)}</div></Card>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Por fornecedor</h2>
      {data.bySupplier.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma compra no período.</p>
      ) : (
        <PaginatedList items={data.bySupplier}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left"><tr><th className="p-3">Fornecedor</th><th className="p-3">Notas</th><th className="p-3">Total</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.supplierId} className="border-t border-slate-100"><td className="p-3">{s.supplierName}</td><td className="p-3">{s.invoiceCount}</td><td className="p-3">{formatCurrency(s.total)}</td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Por produto</h2>
      {data.byProduct.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum item comprado no período.</p>
      ) : (
        <PaginatedList items={data.byProduct}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left"><tr><th className="p-3">Produto</th><th className="p-3">Qtd</th><th className="p-3">Total</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.productId} className="border-t border-slate-100"><td className="p-3">{p.productName}</td><td className="p-3">{p.quantity}</td><td className="p-3">{formatCurrency(p.total)}</td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Contas a pagar por categoria</h2>
      {data.payablesByCategory.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum vencimento no período.</p>
      ) : (
        <PaginatedList items={data.payablesByCategory}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left"><tr><th className="p-3">Categoria</th><th className="p-3">Vencimentos</th><th className="p-3">Valor</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.category} className="border-t border-slate-100"><td className="p-3">{p.category}</td><td className="p-3">{p.count}</td><td className="p-3">{formatCurrency(p.amount)}</td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}
    </>
  );
}

function StockReport({ data }: { data: StockReportResponse }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card><div className="text-sm text-slate-500">Disponível total</div><div className="text-2xl font-bold">{data.totalAvailable}</div></Card>
        <Card><div className="text-sm text-slate-500">Entradas no período</div><div className="text-2xl font-bold">{data.totalIn}</div></Card>
        <Card><div className="text-sm text-slate-500">Saídas no período</div><div className="text-2xl font-bold">{data.totalOut}</div></Card>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Posição de estoque</h2>
      {data.balances.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum saldo de estoque.</p>
      ) : (
        <PaginatedList items={data.balances}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Disponível</th>
                  <th className="p-3">Em trânsito</th>
                  <th className="p-3">Comodato</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.productId} className="border-t border-slate-100">
                    <td className="p-3">{b.productName}</td>
                    <td className="p-3">{b.available}</td>
                    <td className="p-3">{b.inTransit}</td>
                    <td className="p-3">{b.lent}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Movimentações por produto</h2>
      {data.movementsByProduct.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma movimentação no período.</p>
      ) : (
        <PaginatedList items={data.movementsByProduct}>
          {(rows) => (
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Entradas</th>
                  <th className="p-3">Saídas</th>
                  <th className="p-3">Saldo do período</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.productId} className="border-t border-slate-100">
                    <td className="p-3">{m.productName}</td>
                    <td className="p-3">{m.in}</td>
                    <td className="p-3">{m.out}</td>
                    <td className="p-3">{m.net}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </PaginatedList>
      )}
    </>
  );
}
