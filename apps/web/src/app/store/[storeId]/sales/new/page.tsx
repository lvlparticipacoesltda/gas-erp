'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, SALE_CHANNELS } from '@gas-erp/shared';

interface Product { id: string; name: string; storeSettings?: { price: number | string }[] }
interface Customer { id: string; name: string; phone?: string; addresses: { id: string; street: string; number?: string; city: string; state: string; neighborhood?: string }[] }
interface Deliverer { id: string; user: { name: string } }

function parsePrice(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function NewSalePage() {
  const { storeId } = useParams<{ storeId: string }>();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    productId: '',
    quantity: 1,
    unitPrice: 0,
    channel: 'PHONE',
    delivererId: '',
    paymentMethod: 'PIX',
    deliveryStreet: '',
    deliveryNumber: '',
    deliveryNeighborhood: '',
    deliveryCity: '',
    deliveryState: 'SP',
  });

  useEffect(() => {
    Promise.all([
      api<Product[]>(`/products?storeId=${storeId}`, {}, getToken()),
      api<{ data: Customer[] }>(`/customers?search=${search}`, {}, getToken()),
      api<Deliverer[]>(`/deliverers?storeId=${storeId}`, {}, getToken()),
    ]).then(([p, c, d]) => {
      setProducts(p);
      setCustomers(c.data);
      setDeliverers(d);
      if (p[0]) {
        const price = parsePrice(p[0].storeSettings?.[0]?.price);
        setForm((f) => ({ ...f, productId: p[0].id, unitPrice: price }));
      }
    });
  }, [storeId, search]);

  function productPrice(product?: Product): number {
    return parsePrice(product?.storeSettings?.[0]?.price);
  }

  function onCustomerChange(id: string) {
    const customer = customers.find((c) => c.id === id);
    const addr = customer?.addresses[0];
    setForm((f) => ({
      ...f,
      customerId: id,
      deliveryStreet: addr?.street ?? '',
      deliveryNumber: addr?.number ?? '',
      deliveryNeighborhood: addr?.neighborhood ?? '',
      deliveryCity: addr?.city ?? '',
      deliveryState: addr?.state ?? 'SP',
    }));
  }

  function onProductChange(id: string) {
    const product = products.find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      productId: id,
      unitPrice: productPrice(product),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.productId) {
      setError('Selecione um produto para continuar.');
      return;
    }

    const total = form.quantity * form.unitPrice;
    if (total <= 0) {
      setError('Informe um preço unitário válido. Configure o preço em Produtos, se necessário.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/sales', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          customerId: form.customerId || undefined,
          channel: form.channel,
          delivererId: form.delivererId || undefined,
          deliveryStreet: form.deliveryStreet,
          deliveryNumber: form.deliveryNumber,
          deliveryNeighborhood: form.deliveryNeighborhood,
          deliveryCity: form.deliveryCity,
          deliveryState: form.deliveryState,
          items: [{ productId: form.productId, quantity: form.quantity, unitPrice: form.unitPrice }],
          payments: [{ method: form.paymentMethod, amount: total }],
        }),
      }, getToken());
      router.push(`/store/${storeId}/sales`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar a venda');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell mode="store">
      <PageHeader title="Nova venda" subtitle="Cliente → Produto → Entrega → Pagamento" />
      <Card>
        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Label>Buscar cliente</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou telefone" /></div>
          <div>
            <Label>Cliente</Label>
            <Select value={form.customerId} onChange={(e) => onCustomerChange(e.target.value)}>
              <option value="">Cliente não identificado</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Canal</Label>
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              {SALE_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <Label>Produto</Label>
            <Select value={form.productId} onChange={(e) => onProductChange(e.target.value)} required>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Preço unitário</Label>
            <Input type="number" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Entregador</Label>
            <Select value={form.delivererId} onChange={(e) => setForm({ ...form, delivererId: e.target.value })}>
              <option value="">Sem entregador</option>
              {deliverers.map((d) => <option key={d.id} value={d.id}>{d.user.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Pagamento</Label>
            <Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
            </Select>
          </div>
          <div><Label>Logradouro</Label><Input value={form.deliveryStreet} onChange={(e) => setForm({ ...form, deliveryStreet: e.target.value })} /></div>
          <div><Label>Número</Label><Input value={form.deliveryNumber} onChange={(e) => setForm({ ...form, deliveryNumber: e.target.value })} /></div>
          <div><Label>Bairro</Label><Input value={form.deliveryNeighborhood} onChange={(e) => setForm({ ...form, deliveryNeighborhood: e.target.value })} /></div>
          <div><Label>Cidade</Label><Input value={form.deliveryCity} onChange={(e) => setForm({ ...form, deliveryCity: e.target.value })} /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={submitting || products.length === 0}>{submitting ? 'Salvando...' : 'Confirmar venda'}</Button></div>
        </form>
      </Card>
    </AppShell>
  );
}
