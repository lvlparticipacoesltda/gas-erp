'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
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

const emptyForm = { sku: '', name: '', productType: 'GLP', price: 0 };

function parsePrice(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ProductsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);

  async function load() {
    setProducts(await api<Product[]>(`/products?storeId=${storeId}`, {}, getToken()));
  }

  useEffect(() => {
    load().finally(() => setReady(true));
  }, [storeId]);

  function startEdit(product: Product) {
    setFormError('');
    setEditing(product);
    setEditForm({
      sku: product.sku,
      name: product.name,
      productType: product.productType,
      price: parsePrice(product.storeSettings?.[0]?.price),
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    try {
      await api(`/products?storeId=${storeId}`, {
        method: 'POST',
        body: JSON.stringify(form),
      }, getToken());
      setForm(emptyForm);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar produto');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError('');
    try {
      await api(`/products/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sku: editForm.sku,
          name: editForm.name,
          productType: editForm.productType,
        }),
      }, getToken());
      await api(`/products/${editing.id}/price`, {
        method: 'PATCH',
        body: JSON.stringify({ storeId, price: editForm.price }),
      }, getToken());
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar produto');
    }
  }

  const formFields = (value: typeof emptyForm, onChange: (v: typeof emptyForm) => void) => (
    <>
      <div><Label>SKU</Label><Input value={value.sku} onChange={(e) => onChange({ ...value, sku: e.target.value })} required /></div>
      <div><Label>Nome</Label><Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required /></div>
      <div><Label>Tipo</Label><Input value={value.productType} onChange={(e) => onChange({ ...value, productType: e.target.value })} /></div>
      <div><Label>Preço nesta loja</Label><Input type="number" step="0.01" value={value.price} onChange={(e) => onChange({ ...value, price: Number(e.target.value) })} /></div>
    </>
  );

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
    <PageHeader title="Produtos" subtitle="Catálogo e preços por loja" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? 'Editar produto' : 'Novo produto'}</h2>
          {formError && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          )}
          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-3">
              {formFields(editForm, setEditForm)}
              <div className="flex gap-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="secondary" onClick={() => { setEditing(null); setFormError(''); }}>Cancelar</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              {formFields(form, setForm)}
              <Button type="submit">Cadastrar</Button>
            </form>
          )}
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">Produto</th><th className="p-3">Preço</th><th className="p-3">Disponível</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="p-3">{p.name}<div className="text-xs text-slate-500">{p.sku}</div></td>
                <td className="p-3">{formatCurrency(p.storeSettings?.[0]?.price ?? 0)}</td>
                <td className="p-3">{p.stockBalances?.[0]?.available ?? 0}</td>
                <td className="p-3 text-right">
                  <Button type="button" variant="secondary" onClick={() => startEdit(p)}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
