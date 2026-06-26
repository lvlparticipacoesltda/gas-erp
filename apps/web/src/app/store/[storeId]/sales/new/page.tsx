'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { SalesWithSidebar } from '@/components/sales-with-sidebar';
import { Button, Card, Input, Label, Select } from '@/components/ui';
import { CustomerAddressFields, type CustomerAddressForm } from '@/components/customer-address-fields';
import { CustomerPicker, type CustomerPickerValue } from '@/components/customer-picker';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { parsePrice } from '@/lib/sale-utils';
import { cn } from '@/lib/utils';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SALE_CHANNELS,
  SALE_CHANNEL_LABELS,
  type PaginatedResponse,
} from '@gas-erp/shared';

interface Product {
  id: string;
  name: string;
  storeSettings?: { price: number | string; deliveryFee?: number | string }[];
}
interface Deliverer { id: string; user: { name: string } }

type Step = 1 | 2 | 3;

const REGULAR_PAYMENT_METHODS = PAYMENT_METHODS.filter((m) => m !== 'GDP');

const STEPS = [
  { n: 1, label: 'Cliente' },
  { n: 2, label: 'Produto' },
  { n: 3, label: 'Entrega' },
] as const;

export default function NewSalePage() {
  const { storeId } = useParams<{ storeId: string }>();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [customerPick, setCustomerPick] = useState<CustomerPickerValue>({ kind: 'none' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  const [draft, setDraft] = useState({
    customerId: '',
    customerName: '',
    productId: '',
    quantity: 1,
    unitPrice: 0,
    channel: 'PHONE',
    paymentMethod: 'PIX',
    fulfillmentType: 'DELIVERY' as 'PICKUP' | 'DELIVERY',
    delivererId: '',
    notes: '',
    deliveryStreet: '',
    deliveryNumber: '',
    deliveryNeighborhood: '',
    deliveryCity: '',
    deliveryState: 'SP',
    deliveryZipCode: '',
    gasDoPovoBenefit: false,
  });

  const isPortariaChannel = draft.channel === 'IN_STORE';

  function selectChannel(channel: (typeof SALE_CHANNELS)[number]) {
    setDraft((d) => ({
      ...d,
      channel,
      ...(channel === 'IN_STORE'
        ? {
            fulfillmentType: 'PICKUP' as const,
            delivererId: '',
            deliveryStreet: '',
            deliveryNumber: '',
            deliveryNeighborhood: '',
            deliveryCity: '',
            deliveryState: 'SP',
            deliveryZipCode: '',
          }
        : {}),
    }));
  }

  useEffect(() => {
    Promise.all([
      api<PaginatedResponse<Product>>(`/products?storeId=${storeId}&pageSize=100`, {}, getToken()).then((r) => r.data),
      api<Deliverer[]>(`/deliverers?storeId=${storeId}`, {}, getToken()),
    ])
      .then(([p, d]) => {
        setProducts(p);
        setDeliverers(d);
      })
      .finally(() => setReady(true));
  }, [storeId]);

  function applyCustomerPick(value: CustomerPickerValue) {
    setCustomerPick(value);
    if (value.kind === 'none') {
      setDraft((d) => ({
        ...d,
        customerId: '',
        customerName: '',
        deliveryStreet: '',
        deliveryNumber: '',
        deliveryNeighborhood: '',
        deliveryCity: '',
        deliveryState: 'SP',
        deliveryZipCode: '',
      }));
      return;
    }
    if (value.kind === 'anonymous') {
      setDraft((d) => ({
        ...d,
        customerId: '',
        customerName: 'Cliente não identificado',
        deliveryStreet: '',
        deliveryNumber: '',
        deliveryNeighborhood: '',
        deliveryCity: '',
        deliveryState: 'SP',
        deliveryZipCode: '',
      }));
      return;
    }
    const customer = value.customer;
    const addr = customer.addresses[0];
    setDraft((d) => ({
      ...d,
      customerId: customer.id,
      customerName: customer.name,
      deliveryStreet: addr?.street ?? '',
      deliveryNumber: addr?.number ?? '',
      deliveryNeighborhood: addr?.neighborhood ?? '',
      deliveryCity: addr?.city ?? '',
      deliveryState: addr?.state ?? 'SP',
      deliveryZipCode: addr?.zipCode ?? '',
    }));
  }

  function deliveryAddressForm(): CustomerAddressForm {
    return {
      zipCode: draft.deliveryZipCode,
      street: draft.deliveryStreet,
      number: draft.deliveryNumber,
      neighborhood: draft.deliveryNeighborhood,
      city: draft.deliveryCity,
      state: draft.deliveryState,
    };
  }

  function applyDeliveryAddress(address: CustomerAddressForm) {
    setDraft((d) => ({
      ...d,
      deliveryZipCode: address.zipCode,
      deliveryStreet: address.street,
      deliveryNumber: address.number,
      deliveryNeighborhood: address.neighborhood,
      deliveryCity: address.city,
      deliveryState: address.state,
    }));
  }

  function selectProduct(id: string) {
    const product = products.find((p) => p.id === id);
    setDraft((d) => ({
      ...d,
      productId: id,
      unitPrice: parsePrice(product?.storeSettings?.[0]?.price),
    }));
  }

  const selectedProduct = products.find((p) => p.id === draft.productId);
  const itemsSubtotal = draft.quantity * draft.unitPrice;
  const appliesDeliveryFee =
    !isPortariaChannel && draft.fulfillmentType === 'DELIVERY';
  const deliveryFee = appliesDeliveryFee
    ? parsePrice(selectedProduct?.storeSettings?.[0]?.deliveryFee)
    : 0;
  const total = itemsSubtotal + deliveryFee;

  function goNext() {
    setError('');
    if (step === 1) {
      if (customerPick.kind === 'none') {
        setError('Selecione um cliente ou use venda sem cadastro.');
        return;
      }
      setStep(2);
      if (!draft.productId && products[0]) selectProduct(products[0].id);
      return;
    }
    if (step === 2) {
      if (!draft.productId) {
        setError('Selecione um produto.');
        return;
      }
      if (total <= 0) {
        setError('Informe um preço válido para o produto.');
        return;
      }
      setStep(3);
    }
  }

  async function submitSale(requireDeliverer: boolean) {
    setError('');
    const fulfillmentType = isPortariaChannel ? 'PICKUP' : draft.fulfillmentType;
    if (fulfillmentType === 'DELIVERY' && !draft.deliveryStreet.trim()) {
      setError('Informe o endereço de entrega.');
      return;
    }
    if (requireDeliverer && !draft.delivererId) {
      setError('Selecione um entregador.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/sales', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          customerId: draft.customerId || undefined,
          channel: fulfillmentType === 'PICKUP' ? 'IN_STORE' : draft.channel,
          fulfillmentType,
          delivererId:
            fulfillmentType === 'DELIVERY' ? draft.delivererId || undefined : undefined,
          notes: draft.notes || undefined,
          deliveryStreet: draft.deliveryStreet,
          deliveryNumber: draft.deliveryNumber,
          deliveryNeighborhood: draft.deliveryNeighborhood,
          deliveryCity: draft.deliveryCity,
          deliveryState: draft.deliveryState,
          gasDoPovoBenefit: draft.gasDoPovoBenefit,
          items: [{
            productId: draft.productId,
            quantity: draft.quantity,
            unitPrice: draft.unitPrice,
          }],
          payments: draft.gasDoPovoBenefit
            ? [{ method: 'GDP', amount: total }]
            : [{ method: draft.paymentMethod, amount: total }],
        }),
      }, getToken());
      router.push(`/store/${storeId}/sales`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar a venda');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <SalesWithSidebar storeId={storeId}>
        <div className="mb-4">
          <Link href={`/store/${storeId}/sales`} className="text-sm text-brand hover:underline">
            ← Voltar ao histórico
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Nova venda</h1>

        {/* Stepper */}
        <div className="my-6 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => s.n < step && setStep(s.n as Step)}
                className={`flex flex-col items-center gap-1 ${s.n <= step ? 'text-brand-dark' : 'text-slate-400'}`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                    s.n < step
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : s.n === step
                        ? 'border-brand bg-brand text-white'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  {s.n < step ? '✓' : s.n}
                </span>
                <span className="text-xs font-medium">{s.label}</span>
                {s.n === 1 && draft.customerName && (
                  <span className="max-w-[100px] truncate text-[10px] text-slate-500">{draft.customerName}</span>
                )}
                {s.n === 2 && selectedProduct && step > 2 && (
                  <span className="max-w-[100px] truncate text-[10px] text-slate-500">
                    {draft.quantity}x {selectedProduct.name}
                  </span>
                )}
              </button>
              {i < STEPS.length - 1 && (
                <div className={`hidden h-0.5 flex-1 sm:block ${s.n < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* Step 1 — Cliente */}
        {step === 1 && (
          <Card>
            <CustomerPicker storeId={storeId} value={customerPick} onChange={applyCustomerPick} />

            <div className="mt-6">
              <Label>Canal de venda</Label>
              <div className="mt-2 flex flex-wrap gap-4">
                {SALE_CHANNELS.map((c) => (
                  <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="channel"
                      checked={draft.channel === c}
                      onChange={() => selectChannel(c)}
                    />
                    {SALE_CHANNEL_LABELS[c] ?? c}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="button" onClick={goNext}>Continuar →</Button>
            </div>
          </Card>
        )}

        {/* Step 2 — Produto */}
        {step === 2 && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="mb-4 font-semibold">Produtos</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProduct(p.id)}
                    className={`rounded-xl border p-4 text-left transition hover:border-brand-light ${
                      draft.productId === p.id ? 'border-brand bg-brand-muted ring-2 ring-brand-light/40' : 'border-slate-200'
                    }`}
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="mt-1 text-sm text-brand-dark">
                      {formatCurrency(parsePrice(p.storeSettings?.[0]?.price))}
                    </div>
                  </button>
                ))}
              </div>

              {selectedProduct && (
                <div className="mt-6 flex items-center gap-4">
                  <Label>Quantidade</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setDraft((d) => ({ ...d, quantity: Math.max(1, d.quantity - 1) }))}
                    >
                      −
                    </Button>
                    <span className="w-8 text-center font-semibold">{draft.quantity}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setDraft((d) => ({ ...d, quantity: d.quantity + 1 }))}
                    >
                      +
                    </Button>
                  </div>
                  <div className="ml-auto">
                    <Label>Preço unit.</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-28"
                      value={draft.unitPrice}
                      onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}

              <div className="mt-6">
                <Label>Benefício Gás do Povo</Label>
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, gasDoPovoBenefit: !d.gasDoPovoBenefit }))}
                  className={cn(
                    'mt-2 w-full rounded-xl border px-4 py-3 text-left text-sm transition',
                    draft.gasDoPovoBenefit
                      ? 'border-brand bg-brand-muted text-brand-dark'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                  )}
                >
                  <span className="font-medium">Benefício Gás do Povo</span>
                  <span className="mt-1 block text-xs opacity-80">
                    {draft.gasDoPovoBenefit
                      ? 'Sim — pagamento via GDP (forma de pagamento desativada)'
                      : 'Não — toque para marcar como sim'}
                  </span>
                </button>
              </div>

              <div className="mt-6">
                <Label>Pagamento</Label>
                {draft.gasDoPovoBenefit ? (
                  <p className="mt-2 rounded-lg border border-brand bg-brand-muted px-3 py-2 text-sm text-brand-dark">
                    Pagamento registrado como <strong>GDP</strong> (Benefício Gás do Povo)
                  </p>
                ) : (
                  <Select
                    className="mt-2"
                    value={draft.paymentMethod}
                    onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}
                  >
                    {REGULAR_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                    ))}
                  </Select>
                )}
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 font-semibold">Resumo</h2>
              <p className="text-sm text-slate-600">Cliente: {draft.customerName || '—'}</p>
              {selectedProduct && (
                <p className="mt-2 text-sm">
                  {draft.quantity}x {selectedProduct.name}
                </p>
              )}
              {deliveryFee > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  Taxa entrega: {formatCurrency(deliveryFee)}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-600">
                Pagamento:{' '}
                {draft.gasDoPovoBenefit
                  ? PAYMENT_METHOD_LABELS.GDP
                  : (PAYMENT_METHOD_LABELS[draft.paymentMethod] ?? draft.paymentMethod)}
              </p>
              <p className="mt-4 text-xl font-bold text-slate-900">{formatCurrency(total)}</p>
              <div className="mt-6 flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(1)}>← Voltar</Button>
                <Button type="button" onClick={goNext}>Continuar →</Button>
              </div>
            </Card>
          </div>
        )}

        {/* Step 3 — Entrega / Portaria */}
        {step === 3 && (
          <Card>
            <h2 className="mb-4 font-semibold">Tipo de venda</h2>
            {isPortariaChannel ? (
              <div className="mb-6 rounded-lg border border-brand bg-brand-muted px-4 py-3">
                <div className="font-medium text-brand-dark">Portaria</div>
                <p className="mt-1 text-sm text-slate-600">
                  Canal portaria selecionado — o cliente retira na loja e a venda fica com status Portaria.
                </p>
              </div>
            ) : (
              <div className="mb-6 flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-muted">
                  <input
                    type="radio"
                    name="fulfillment"
                    checked={draft.fulfillmentType === 'PICKUP'}
                    onChange={() => setDraft({ ...draft, fulfillmentType: 'PICKUP', delivererId: '' })}
                  />
                  <div>
                    <div className="font-medium">Portaria</div>
                    <div className="text-xs text-slate-500">Cliente retira na loja — status Portaria</div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-muted">
                  <input
                    type="radio"
                    name="fulfillment"
                    checked={draft.fulfillmentType === 'DELIVERY'}
                    onChange={() => setDraft({ ...draft, fulfillmentType: 'DELIVERY' })}
                  />
                  <div>
                    <div className="font-medium">Entrega</div>
                    <div className="text-xs text-slate-500">Endereço + entregador — aparece na barra lateral</div>
                  </div>
                </label>
              </div>
            )}

            {!isPortariaChannel && draft.fulfillmentType === 'DELIVERY' && (
              <>
                <h3 className="mb-3 font-medium">Endereço de entrega</h3>
                <div className="mb-6">
                  <CustomerAddressFields
                    value={deliveryAddressForm()}
                    onChange={applyDeliveryAddress}
                  />
                </div>

                <h3 className="mb-3 font-medium">Escolha o entregador</h3>
                <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {deliverers.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDraft({ ...draft, delivererId: d.id })}
                      className={`rounded-xl border p-3 text-left ${
                        draft.delivererId === d.id ? 'border-orange-500 bg-orange-50' : 'border-slate-200'
                      }`}
                    >
                      <span className="text-lg">🛵</span>
                      <div className="mt-1 font-medium">{d.user.name}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="mb-6">
              <Label>Observação (opcional)</Label>
              <Input
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder={isPortariaChannel || draft.fulfillmentType === 'PICKUP' ? 'Observação da venda' : 'Recado para o entregador'}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>← Voltar</Button>
              <div className="flex flex-wrap gap-2">
                {isPortariaChannel || draft.fulfillmentType === 'PICKUP' ? (
                  <Button type="button" disabled={submitting} onClick={() => submitSale(false)}>
                    {submitting ? 'Salvando...' : 'Concluir venda (portaria)'}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={submitting}
                      onClick={() => submitSale(false)}
                    >
                      Finalizar sem entregador
                    </Button>
                    <Button
                      type="button"
                      disabled={submitting}
                      onClick={() => submitSale(true)}
                    >
                      {submitting ? 'Salvando...' : 'Confirmar com entregador'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        )}
      </SalesWithSidebar>
  );
}
