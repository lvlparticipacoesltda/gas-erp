'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { PaginatedSection } from '@/components/paginated-section';
import { Badge, Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PURCHASE_INVOICE_STATUS_LABELS, type PaginatedResponse } from '@gas-erp/shared';

interface StoreOption {
  id: string;
  name: string;
}

interface PurchaseInvoice {
  id: string;
  number: string;
  issueDate: string;
  total: number | string;
  status: string;
  supplier?: { legalName: string; tradeName?: string | null } | null;
  store?: { id: string; name: string } | null;
}

interface CylinderProduct {
  productId: string;
  name: string;
  sku: string;
  qty: number;
}

interface CylinderStore {
  storeId: string;
  storeName: string;
  totalQty: number;
  products: CylinderProduct[];
}

interface CylinderEntries {
  stores: CylinderStore[];
  totalQty: number;
}

const PAGE_SIZE = 20;

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  return 'warning';
}

function todayKey(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

function monthStartKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function MasterPurchasesPage() {
  const router = useRouter();

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeFilter, setStoreFilter] = useState('');

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // Resumo de entrada de botijões
  const [dateFrom, setDateFrom] = useState(monthStartKey());
  const [dateTo, setDateTo] = useState(todayKey());
  const [entries, setEntries] = useState<CylinderEntries | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);

  useEffect(() => {
    api<StoreOption[]>('/stores', {}, getToken())
      .then((res) => setStores(res))
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [storeFilter]);

  useEffect(() => {
    setLoading(true);
    const scope = storeFilter ? `&storeId=${storeFilter}` : '';
    api<PaginatedResponse<PurchaseInvoice>>(
      `/purchase-invoices?page=${page}&pageSize=${PAGE_SIZE}${scope}`,
      {},
      getToken(),
    )
      .then((res) => {
        setInvoices(res.data);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, [page, storeFilter]);

  useEffect(() => {
    setEntriesLoading(true);
    const params = new URLSearchParams();
    if (storeFilter) params.set('storeId', storeFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    api<CylinderEntries>(
      `/purchase-invoices/cylinder-entries?${params.toString()}`,
      {},
      getToken(),
    )
      .then((res) => setEntries(res))
      .catch(() => setEntries(null))
      .finally(() => setEntriesLoading(false));
  }, [storeFilter, dateFrom, dateTo]);

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Compras"
        subtitle="Notas de entrada de todas as unidades"
        action={
          <Link href="/master/purchases/new">
            <Button>Lançar nota</Button>
          </Link>
        }
      />

      {/* Entrada de botijões por unidade */}
      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Entrada de botijões por unidade
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Botijões (GLP) que entraram via notas de compra confirmadas no período.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>De</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>Até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        {entriesLoading ? (
          <p className="py-6 text-center text-sm text-slate-400">Carregando…</p>
        ) : entries && entries.stores.length > 0 ? (
          <>
            <div className="mb-4 rounded-lg bg-brand-muted px-4 py-3 text-sm text-brand-dark">
              Total no período:{' '}
              <span className="font-semibold">{entries.totalQty} botijões</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.stores.map((s) => (
                <div
                  key={s.storeId}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-slate-900">{s.storeName}</span>
                    <span className="text-lg font-semibold text-brand-dark">{s.totalQty}</span>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-slate-600">
                    {s.products.map((p) => (
                      <li key={p.productId} className="flex justify-between">
                        <span>{p.name}</span>
                        <span className="font-medium text-slate-800">{p.qty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-slate-400">
            Nenhuma entrada de botijões no período.
          </p>
        )}
      </Card>

      {/* Notas lançadas */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <div className="w-full max-w-xs">
            <Label>Filtrar por unidade</Label>
            <Select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
              <option value="">Todas as unidades</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <PaginatedSection
          loading={loading}
          pagination={{
            className: 'border-t border-slate-100 px-4 py-3',
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
                <th className="p-3">Unidade</th>
                <th className="p-3">Data da nota</th>
                <th className="p-3">Número</th>
                <th className="p-3">Fornecedor</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="p-3">{inv.store?.name ?? '-'}</td>
                  <td className="p-3">{formatDate(inv.issueDate)}</td>
                  <td className="p-3">{inv.number}</td>
                  <td className="p-3">
                    {inv.supplier ? inv.supplier.tradeName || inv.supplier.legalName : '-'}
                  </td>
                  <td className="p-3">{formatCurrency(inv.total)}</td>
                  <td className="p-3">
                    <Badge tone={statusTone(inv.status)}>
                      {PURCHASE_INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    {inv.store ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          router.push(`/store/${inv.store!.id}/purchases/${inv.id}`)
                        }
                      >
                        Ver / editar
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-slate-400">
                    Nenhuma compra registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </PaginatedSection>
      </Card>
    </>
  );
}
