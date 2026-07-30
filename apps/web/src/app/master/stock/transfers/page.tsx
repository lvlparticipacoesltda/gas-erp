'use client';

import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { Badge, Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import {
  STOCK_TRANSFER_STATUSES,
  STOCK_TRANSFER_STATUS_LABELS,
  type PaginatedResponse,
} from '@gas-erp/shared';

interface StoreOption {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
}

interface Transfer {
  id: string;
  status: string;
  requestedAt: string;
  completedAt?: string | null;
  fromStore: { id: string; name: string };
  toStore: { id: string; name: string };
  items: { quantity: number; product: { name: string } }[];
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'APPROVED') return 'default';
  if (status === 'REJECTED') return 'danger';
  return 'warning';
}

export default function MasterStockTransfersPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [form, setForm] = useState({
    fromStoreId: '',
    toStoreId: '',
    productId: '',
    quantity: 1,
  });

  useEffect(() => {
    api<StoreOption[]>('/stores', {}, getToken())
      .then((res) => {
        setStores(res);
        if (res[0]) {
          setForm((f) => ({
            ...f,
            fromStoreId: f.fromStoreId || res[0].id,
            toStoreId: f.toStoreId || res.find((s) => s.id !== res[0].id)?.id || '',
          }));
        }
      })
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    if (!form.fromStoreId) {
      setProducts([]);
      return;
    }
    api<PaginatedResponse<Product>>(
      `/products?storeId=${form.fromStoreId}&pageSize=100`,
      {},
      getToken(),
    )
      .then((res) => {
        setProducts(res.data);
        setForm((f) => ({
          ...f,
          productId: res.data.some((p) => p.id === f.productId)
            ? f.productId
            : res.data[0]?.id ?? '',
        }));
      })
      .catch(() => setProducts([]));
  }, [form.fromStoreId]);

  async function loadTransfers() {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromFilter) params.set('fromStoreId', fromFilter);
    if (toFilter) params.set('toStoreId', toFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    try {
      const list = await api<Transfer[]>(
        `/stock-transfers?${params.toString()}`,
        {},
        getToken(),
      );
      setTransfers(list);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }

  useEffect(() => {
    loadTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromFilter, toFilter, statusFilter, dateFrom, dateTo]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fromStoreId || !form.toStoreId || !form.productId) return;
    setSubmitting(true);
    try {
      await api(
        '/stock-transfers',
        {
          method: 'POST',
          body: JSON.stringify({
            fromStoreId: form.fromStoreId,
            toStoreId: form.toStoreId,
            items: [{ productId: form.productId, quantity: form.quantity }],
          }),
        },
        getToken(),
      );
      await loadTransfers();
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(id: string, status: 'APPROVED' | 'REJECTED' | 'COMPLETED') {
    await api(
      `/stock-transfers/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      getToken(),
    );
    await loadTransfers();
  }

  const destinationStores = stores.filter((s) => s.id !== form.fromStoreId);

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Transferências"
        subtitle="Movimentação de estoque entre todas as unidades"
      />

      <div className="grid gap-6">
        <Card className="max-w-2xl">
          <h2 className="mb-4 font-semibold">Nova transferência</h2>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Loja origem</Label>
              <Select
                value={form.fromStoreId}
                onChange={(e) => {
                  const fromStoreId = e.target.value;
                  setForm((f) => ({
                    ...f,
                    fromStoreId,
                    toStoreId: f.toStoreId === fromStoreId ? '' : f.toStoreId,
                  }));
                }}
                required
              >
                <option value="" disabled>
                  Selecione
                </option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Loja destino</Label>
              <Select
                value={form.toStoreId}
                onChange={(e) => setForm({ ...form, toStoreId: e.target.value })}
                required
              >
                <option value="" disabled>
                  Selecione
                </option>
                {destinationStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Produto</Label>
              <Select
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                required
                disabled={!form.fromStoreId || products.length === 0}
              >
                {products.length === 0 ? (
                  <option value="">Nenhum produto</option>
                ) : (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </Select>
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting || destinationStores.length === 0}>
                {submitting ? 'Solicitando…' : 'Solicitar transferência'}
              </Button>
              <p className="mt-2 text-xs text-slate-400">
                Vasilhame vinculado ao produto é incluído automaticamente na mesma quantidade.
              </p>
            </div>
          </form>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
            <div className="w-full max-w-[12rem]">
              <Label>Origem</Label>
              <Select value={fromFilter} onChange={(e) => setFromFilter(e.target.value)}>
                <option value="">Todas</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full max-w-[12rem]">
              <Label>Destino</Label>
              <Select value={toFilter} onChange={(e) => setToFilter(e.target.value)}>
                <option value="">Todas</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full max-w-[11rem]">
              <Label>Status</Label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Todos</option>
                {STOCK_TRANSFER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STOCK_TRANSFER_STATUS_LABELS[s] ?? s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>De</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>Até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Carregando…</p>
          ) : (
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Origem → Destino</th>
                  <th className="p-3">Itens</th>
                  <th className="p-3">Solicitada em</th>
                  <th className="p-3">Concluída em</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="p-3">
                      {t.fromStore.name} → {t.toStore.name}
                    </td>
                    <td className="p-3">
                      {t.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ')}
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatDateTime(t.requestedAt)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {t.completedAt ? formatDateTime(t.completedAt) : '—'}
                    </td>
                    <td className="p-3">
                      <Badge tone={statusTone(t.status)}>
                        {STOCK_TRANSFER_STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                    </td>
                    <td className="p-3 space-x-2">
                      {t.status === 'PENDING' && (
                        <>
                          <Button variant="secondary" onClick={() => setStatus(t.id, 'APPROVED')}>
                            Aprovar
                          </Button>
                          <Button variant="danger" onClick={() => setStatus(t.id, 'REJECTED')}>
                            Rejeitar
                          </Button>
                        </>
                      )}
                      {t.status === 'APPROVED' && (
                        <Button onClick={() => setStatus(t.id, 'COMPLETED')}>Concluir</Button>
                      )}
                    </td>
                  </tr>
                ))}
                {transfers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-sm text-slate-400">
                      Nenhuma transferência no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
