'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface Product {
  id: string;
  sku: string;
  name: string;
  productType: string;
  storeSettings?: { price: number | string }[];
  stockBalances?: { available: number; inTransit: number; lent: number }[];
}

export default function ProductsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ sku: '', name: '', productType: 'GLP', price: 0 });

  async function load() {
    setProducts(await api<Product[]>(`/products?storeId=${storeId}`, {}, getToken()));
  }

  useEffect(() => { load(); }, [storeId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api(`/products?storeId=${storeId}`, {
      method: 'POST',
      body: JSON.stringify(form),
    }, getToken());
    setForm({ sku: '', name: '', productType: 'GLP', price: 0 });
    load();
  }

  return (
    <AppShell mode="store">
      <PageHeader title="Produtos" subtitle="Catálogo e preços por loja" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Novo produto</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></div>
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Tipo</Label><Input value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} /></div>
            <div><Label>Preço</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            <Button type="submit">Cadastrar</Button>
          </form>
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">Produto</th><th className="p-3">Preço</th><th className="p-3">Disponível</th><th className="p-3">Trânsito</th><th className="p-3">Comodato</th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="p-3">{p.name}<div className="text-xs text-slate-500">{p.sku}</div></td>
                <td className="p-3">{formatCurrency(p.storeSettings?.[0]?.price ?? 0)}</td>
                <td className="p-3">{p.stockBalances?.[0]?.available ?? 0}</td>
                <td className="p-3">{p.stockBalances?.[0]?.inTransit ?? 0}</td>
                <td className="p-3">{p.stockBalances?.[0]?.lent ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AppShell>
  );
}
