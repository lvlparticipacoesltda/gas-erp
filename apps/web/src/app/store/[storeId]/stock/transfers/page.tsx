'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { PageLoader } from '@/components/brand-loader';
import { Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';

interface Store { id: string; name: string }
interface Product { id: string; name: string }
interface Transfer {
  id: string;
  status: string;
  fromStore: { name: string };
  toStore: { name: string };
  items: { quantity: number; product: { name: string } }[];
}

export default function StockTransfersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [form, setForm] = useState({ toStoreId: '', productId: '', quantity: 1 });
  const [ready, setReady] = useState(false);

  async function load() {
    const [s, p, t] = await Promise.all([
      api<Store[]>('/stores', {}, getToken()),
      api<Product[]>(`/products?storeId=${storeId}`, {}, getToken()),
      api<Transfer[]>(`/stock-transfers?storeId=${storeId}`, {}, getToken()),
    ]);
    setStores(s.filter((x) => x.id !== storeId));
    setProducts(p);
    setTransfers(t);
    if (p[0]) setForm((f) => ({ ...f, productId: p[0].id }));
    if (s.find((x) => x.id !== storeId)) setForm((f) => ({ ...f, toStoreId: s.find((x) => x.id !== storeId)!.id }));
  }

  useEffect(() => { load().finally(() => setReady(true)); }, [storeId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api('/stock-transfers', {
      method: 'POST',
      body: JSON.stringify({
        fromStoreId: storeId,
        toStoreId: form.toStoreId,
        items: [{ productId: form.productId, quantity: form.quantity }],
      }),
    }, getToken());
    load();
  }

  async function approve(id: string) {
    await api(`/stock-transfers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'APPROVED' }),
    }, getToken());
    load();
  }

  async function complete(id: string) {
    await api(`/stock-transfers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED' }),
    }, getToken());
    load();
  }

  if (!ready) {
    return (
      <AppShell mode="store">
        <PageLoader />
      </AppShell>
    );
  }

  return (
    <AppShell mode="store">
      <PageHeader title="Transferências de estoque" subtitle="Movimentação entre unidades" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Nova transferência</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <Label>Loja destino</Label>
              <Select value={form.toStoreId} onChange={(e) => setForm({ ...form, toStoreId: e.target.value })} required>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Produto</Label>
              <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div><Label>Quantidade</Label><Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
            <Button type="submit">Solicitar</Button>
          </form>
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">Origem → Destino</th><th className="p-3">Itens</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="p-3">{t.fromStore.name} → {t.toStore.name}</td>
                <td className="p-3">{t.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ')}</td>
                <td className="p-3">{t.status}</td>
                <td className="p-3 space-x-2">
                  {t.status === 'PENDING' && <Button variant="secondary" onClick={() => approve(t.id)}>Aprovar</Button>}
                  {t.status === 'APPROVED' && <Button onClick={() => complete(t.id)}>Concluir</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AppShell>
  );
}
