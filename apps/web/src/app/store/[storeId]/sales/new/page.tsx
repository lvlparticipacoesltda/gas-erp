'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { Button, Card, Input, Label, Select } from '@/components/ui';
import { CustomerAddressFields, type CustomerAddressForm } from '@/components/customer-address-fields';
import { CustomerPicker, type CustomerPickerValue } from '@/components/customer-picker';
import {
  SalePaymentsEditor,
  createDefaultPaymentLines,
  paymentsMatchTotal,
  salePaymentLinesToPayload,
  type SalePaymentLine,
  type StorePaymentMethodOption,
} from '@/components/sale-payments-editor';
import { api, getStoredUser, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { parsePrice } from '@/lib/sale-utils';
import { cn } from '@/lib/utils';
import {
  PAYMENT_METHOD_LABELS,
  SALE_CHANNELS,
  SALE_CHANNEL_LABELS,
  getPaymentLinesSumErrorMessage,
  canManageSales,
  isPastBusinessDay,
  todayBusinessDateKey,
  isDelivererAssignableForSale,
  formatDistanceMeters,
  type PaginatedResponse,
  type DelivererSuggestResponse,
} from '@gas-erp/shared';

interface Product {
  id: string;
  name: string;
  storeSettings?: { price: number | string; deliveryFee?: number | string }[];
}
interface Deliverer {
  id: string;
  status: string;
  pendingDeliveryCount?: number;
  user: { name: string; active?: boolean };
}

type Step = 1 | 2 | 3;

type SaleLineItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

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
  const [paymentMethods, setPaymentMethods] = useState<StorePaymentMethodOption[]>([]);
  const [paymentLines, setPaymentLines] = useState<SalePaymentLine[]>([]);
  const [delivererDistances, setDelivererDistances] = useState<Record<string, string>>({});
  const [suggestNote, setSuggestNote] = useState('');
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [customerPriceByProduct, setCustomerPriceByProduct] = useState<Record<string, number>>({});
  const [customerPriceError, setCustomerPriceError] = useState('');
  const [customerPick, setCustomerPick] = useState<CustomerPickerValue>({ kind: 'none' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const currentUser = getStoredUser<{ role: string }>();
  const isManager = currentUser ? canManageSales(currentUser.role) : false;

  const [lineItems, setLineItems] = useState<SaleLineItem[]>([]);
  const [draft, setDraft] = useState({
    customerId: '',
    customerName: '',
    channel: 'PHONE',
    fulfillmentType: 'DELIVERY' as 'PICKUP' | 'DELIVERY',
    delivererId: '',
    notes: '',
    saleDate: todayBusinessDateKey(),
    backdateRequestNotes: '',
    deliveryStreet: '',
    deliveryNumber: '',
    deliveryComplement: '',
    deliveryNeighborhood: '',
    deliveryCity: '',
    deliveryState: 'SP',
    deliveryZipCode: '',
    gasDoPovoBenefit: false,
  });

  const isPortariaChannel = draft.channel === 'IN_STORE';
  const isBackdated = isPastBusinessDay(draft.saleDate);
  const needsBackdateApproval = isBackdated && !isManager;

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
            deliveryComplement: '',
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
      api<StorePaymentMethodOption[]>(`/stores/${storeId}/payment-methods?activeOnly=true`, {}, getToken()),
    ])
      .then(([p, d, methods]) => {
        setProducts(p);
        setDeliverers(d);
        setPaymentMethods(methods);
        const regular = methods.filter((m) => m.systemCode !== 'GDP');
        if (regular[0]) {
          setPaymentLines(createDefaultPaymentLines(regular, 0, regular[0].id));
        }
      })
      .finally(() => setReady(true));
  }, [storeId]);

  useEffect(() => {
    if (!draft.customerId) {
      setCustomerPriceByProduct({});
      setCustomerPriceError('');
      return;
    }
    let cancelled = false;
    setCustomerPriceError('');
    api<Record<string, number>>(
      `/customers/${draft.customerId}/product-prices/map?storeId=${storeId}`,
      {},
      getToken(),
    )
      .then((map) => {
        if (!cancelled) setCustomerPriceByProduct(map);
      })
      .catch((err) => {
        if (!cancelled) {
          setCustomerPriceByProduct({});
          setCustomerPriceError(
            err instanceof Error ? err.message : 'Não foi possível carregar preços do cliente',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft.customerId, storeId]);

  function storeProductPrice(product?: Product): number {
    return parsePrice(product?.storeSettings?.[0]?.price);
  }

  function resolveProductUnitPrice(productId: string): number {
    const custom = customerPriceByProduct[productId];
    if (custom != null) return custom;
    const product = products.find((p) => p.id === productId);
    return storeProductPrice(product);
  }

  useEffect(() => {
    if (!lineItems.length) return;
    setLineItems((items) =>
      items.map((item) => ({
        ...item,
        unitPrice: resolveProductUnitPrice(item.productId),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalc when customer prices or catalog load
  }, [customerPriceByProduct, products]);

  const gdpPaymentMethod = paymentMethods.find((m) => m.systemCode === 'GDP')
    ?? null;
  const regularPaymentMethods = paymentMethods.filter((m) => m.systemCode !== 'GDP');

  useEffect(() => {
    if (step !== 3 || isPortariaChannel || draft.fulfillmentType !== 'DELIVERY') return;
    if (!draft.deliveryStreet.trim() || !draft.deliveryCity.trim() || !draft.deliveryState.trim()) return;

    const params = new URLSearchParams({
      storeId,
      deliveryStreet: draft.deliveryStreet,
      deliveryNumber: draft.deliveryNumber,
      deliveryNeighborhood: draft.deliveryNeighborhood,
      deliveryCity: draft.deliveryCity,
      deliveryState: draft.deliveryState,
    });

    let cancelled = false;
    setSuggestLoading(true);
    api<DelivererSuggestResponse>(`/deliverers/suggest?${params}`, {}, getToken())
      .then((res) => {
        if (cancelled) return;
        const distances: Record<string, string> = {};
        for (const s of res.suggestions) {
          if (s.distanceMeters != null) {
            distances[s.delivererId] = formatDistanceMeters(s.distanceMeters);
          }
        }
        setDelivererDistances(distances);
        const best = res.suggestions.find((s) => s.assignable && s.distanceMeters != null);
        if (best) {
          setDraft((d) => ({ ...d, delivererId: best.delivererId }));
          setSuggestNote(
            `Entregador mais próximo sugerido: ${best.name} (${formatDistanceMeters(best.distanceMeters!)})`,
          );
        } else if (!res.destination) {
          setSuggestNote('Endereço não localizado no mapa. Selecione o entregador manualmente.');
        } else {
          setSuggestNote('Nenhum entregador com GPS recente. Selecione manualmente.');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestNote('Sugestão por distância indisponível. Selecione o entregador manualmente.');
        }
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    step,
    isPortariaChannel,
    draft.fulfillmentType,
    draft.deliveryStreet,
    draft.deliveryNumber,
    draft.deliveryComplement,
    draft.deliveryNeighborhood,
    draft.deliveryCity,
    draft.deliveryState,
    storeId,
  ]);

  function applyCustomerPick(value: CustomerPickerValue) {
    setCustomerPick(value);
    if (value.kind === 'none') {
      setDraft((d) => ({
        ...d,
        customerId: '',
        customerName: '',
        deliveryStreet: '',
        deliveryNumber: '',
        deliveryComplement: '',
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
        deliveryComplement: '',
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
      deliveryComplement: addr?.complement ?? '',
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
      complement: draft.deliveryComplement,
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
      deliveryComplement: address.complement,
      deliveryNeighborhood: address.neighborhood,
      deliveryCity: address.city,
      deliveryState: address.state,
    }));
  }

  function addProduct(id: string) {
    setLineItems((items) => {
      const existing = items.find((item) => item.productId === id);
      if (existing) {
        return items.map((item) =>
          item.productId === id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...items, { productId: id, quantity: 1, unitPrice: resolveProductUnitPrice(id) }];
    });
  }

  function updateLineItem(productId: string, patch: Partial<Pick<SaleLineItem, 'quantity' | 'unitPrice'>>) {
    setLineItems((items) =>
      items.map((item) => (item.productId === productId ? { ...item, ...patch } : item)),
    );
  }

  function removeLineItem(productId: string) {
    setLineItems((items) => items.filter((item) => item.productId !== productId));
  }

  function lineItemCount(productId: string): number {
    return lineItems.find((item) => item.productId === productId)?.quantity ?? 0;
  }

  const itemsSubtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const appliesDeliveryFee =
    !isPortariaChannel && draft.fulfillmentType === 'DELIVERY';
  const deliveryFee = appliesDeliveryFee
    ? [...new Set(lineItems.map((item) => item.productId))].reduce((sum, productId) => {
        const product = products.find((p) => p.id === productId);
        return sum + parsePrice(product?.storeSettings?.[0]?.deliveryFee);
      }, 0)
    : 0;
  const total = itemsSubtotal + deliveryFee;

  useEffect(() => {
    if (!regularPaymentMethods.length || draft.gasDoPovoBenefit) return;
    setPaymentLines((current) => {
      if (current.length === 0) {
        return createDefaultPaymentLines(regularPaymentMethods, total);
      }
      if (current.length === 1) {
        return [{ ...current[0], amount: total }];
      }
      return current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync single-line amount with sale total
  }, [total, draft.gasDoPovoBenefit, regularPaymentMethods.length]);

  const assignableDeliverers = deliverers.filter(
    (d) => isDelivererAssignableForSale(d).assignable,
  );

  function goNext() {
    setError('');
    if (step === 1) {
      if (customerPick.kind === 'none') {
        setError('Selecione um cliente ou use venda sem cadastro.');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (lineItems.length === 0) {
        setError('Adicione pelo menos um produto.');
        return;
      }
      if (lineItems.some((item) => item.unitPrice <= 0)) {
        setError('Informe um preço válido para todos os produtos.');
        return;
      }
      if (total <= 0) {
        setError('O total da venda deve ser maior que zero.');
        return;
      }
      if (!draft.gasDoPovoBenefit && !paymentsMatchTotal(paymentLines, total)) {
        setError(getPaymentLinesSumErrorMessage(paymentLines, total));
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
    if (needsBackdateApproval && !draft.backdateRequestNotes.trim()) {
      setError('Informe o motivo para registrar a venda com data anterior.');
      return;
    }
    if (!draft.gasDoPovoBenefit && !paymentsMatchTotal(paymentLines, total)) {
      setError(getPaymentLinesSumErrorMessage(paymentLines, total));
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
          saleDate: draft.saleDate,
          backdateRequestNotes: needsBackdateApproval ? draft.backdateRequestNotes.trim() : undefined,
          deliveryStreet: draft.deliveryStreet,
          deliveryNumber: draft.deliveryNumber,
          deliveryComplement: draft.deliveryComplement || undefined,
          deliveryNeighborhood: draft.deliveryNeighborhood,
          deliveryCity: draft.deliveryCity,
          deliveryState: draft.deliveryState,
          gasDoPovoBenefit: draft.gasDoPovoBenefit,
          items: lineItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          payments: draft.gasDoPovoBenefit
            ? gdpPaymentMethod
              ? [{ storePaymentMethodId: gdpPaymentMethod.id, amount: total }]
              : [{ method: 'GDP', amount: total }]
            : salePaymentLinesToPayload(paymentLines),
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
    <>
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
                {s.n === 2 && lineItems.length > 0 && step > 2 && (
                  <span className="max-w-[100px] truncate text-[10px] text-slate-500">
                    {lineItems.reduce((sum, item) => sum + item.quantity, 0)} item(ns)
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

            <div className="mt-6">
              <Label>Data da venda</Label>
              <Input
                type="date"
                className="mt-2 max-w-xs"
                max={todayBusinessDateKey()}
                value={draft.saleDate}
                onChange={(e) => setDraft((d) => ({ ...d, saleDate: e.target.value }))}
              />
              {isBackdated && (
                <p className="mt-2 text-sm text-amber-800">
                  {needsBackdateApproval
                    ? 'Data anterior — a venda ficará aguardando aprovação do gerente antes de baixar estoque e entrar no resumo do dia.'
                    : 'Data anterior — como gerente/master, a venda será registrada e aprovada automaticamente.'}
                </p>
              )}
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
              {customerPriceError && (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {customerPriceError}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {products.map((p) => {
                  const storePrice = storeProductPrice(p);
                  const customerPrice = customerPriceByProduct[p.id];
                  const displayPrice = customerPrice ?? storePrice;
                  const inCart = lineItemCount(p.id);
                  return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p.id)}
                    className={`rounded-xl border p-4 text-left transition hover:border-brand-light ${
                      inCart > 0 ? 'border-brand bg-brand-muted ring-2 ring-brand-light/40' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{p.name}</div>
                      {inCart > 0 ? (
                        <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
                          {inCart}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-brand-dark">
                      {customerPrice != null ? (
                        <>
                          <span className="text-slate-400 line-through">{formatCurrency(storePrice)}</span>
                          {' '}
                          {formatCurrency(displayPrice)}
                          <span className="ml-1 text-xs text-brand">preço cliente</span>
                        </>
                      ) : (
                        formatCurrency(displayPrice)
                      )}
                    </div>
                    <div className="mt-2 text-xs font-medium text-slate-500">Toque para adicionar</div>
                  </button>
                  );
                })}
              </div>

              {lineItems.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="font-medium text-slate-900">Itens da venda</h3>
                  {lineItems.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    if (!product) return null;
                    return (
                      <div
                        key={item.productId}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="min-w-[140px] flex-1 font-medium">{product.name}</div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => updateLineItem(item.productId, { quantity: Math.max(1, item.quantity - 1) })}
                          >
                            −
                          </Button>
                          <span className="w-8 text-center font-semibold">{item.quantity}</span>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => updateLineItem(item.productId, { quantity: item.quantity + 1 })}
                          >
                            +
                          </Button>
                        </div>
                        <div>
                          <Label>Preço unit.</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="mt-1 w-28"
                            value={item.unitPrice}
                            onChange={(e) => updateLineItem(item.productId, { unitPrice: Number(e.target.value) })}
                          />
                        </div>
                        <div className="ml-auto text-right text-sm font-semibold text-slate-900">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </div>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => removeLineItem(item.productId)}
                        >
                          Remover
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6">
                <Label>Benefício Gás do Povo</Label>
                <button
                  type="button"
                  onClick={() => setDraft((d) => {
                    const nextGdp = !d.gasDoPovoBenefit;
                    if (!nextGdp) {
                      setLineItems((items) =>
                        items.map((item) => ({
                          ...item,
                          unitPrice: resolveProductUnitPrice(item.productId),
                        })),
                      );
                    }
                    return { ...d, gasDoPovoBenefit: nextGdp };
                  })}
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
                <SalePaymentsEditor
                  className="mt-2"
                  methods={paymentMethods}
                  lines={paymentLines}
                  onChange={setPaymentLines}
                  saleTotal={total}
                  gdpLocked={draft.gasDoPovoBenefit}
                  gdpMethodId={gdpPaymentMethod?.id}
                />
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 font-semibold">Resumo</h2>
              <p className="text-sm text-slate-600">Cliente: {draft.customerName || '—'}</p>
              {lineItems.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {lineItems.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    return (
                      <li key={item.productId}>
                        {item.quantity}x {product?.name ?? 'Produto'} — {formatCurrency(item.unitPrice)}
                      </li>
                    );
                  })}
                </ul>
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
                  : paymentLines.map((line) => {
                      const method = regularPaymentMethods.find((m) => m.id === line.storePaymentMethodId);
                      return `${method?.label ?? '—'} ${formatCurrency(line.amount)}`;
                    }).join(' + ') || '—'}
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
                {suggestLoading ? (
                  <p className="mb-3 text-sm text-slate-500">Calculando entregador mais próximo...</p>
                ) : suggestNote ? (
                  <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {suggestNote}
                  </p>
                ) : null}
                {assignableDeliverers.length === 0 ? (
                  <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Nenhum entregador disponível no momento. Verifique o mapa de entregadores.
                  </p>
                ) : (
                  <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {assignableDeliverers.map((d) => (
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
                        {delivererDistances[d.id] ? (
                          <div className="mt-0.5 text-xs text-slate-500">{delivererDistances[d.id]}</div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
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

            {needsBackdateApproval && (
              <div className="mb-6">
                <Label>Motivo da data anterior</Label>
                <Input
                  value={draft.backdateRequestNotes}
                  onChange={(e) => setDraft({ ...draft, backdateRequestNotes: e.target.value })}
                  placeholder="Ex.: esqueci de lançar antes da meia-noite"
                  required
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>← Voltar</Button>
              <div className="flex flex-wrap gap-2">
                {isPortariaChannel || draft.fulfillmentType === 'PICKUP' ? (
                  <Button type="button" disabled={submitting} onClick={() => submitSale(false)}>
                    {submitting ? 'Salvando...' : needsBackdateApproval ? 'Enviar para aprovação' : 'Concluir venda (portaria)'}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={submitting}
                      onClick={() => submitSale(false)}
                    >
                      {needsBackdateApproval ? 'Enviar sem entregador' : 'Finalizar sem entregador'}
                    </Button>
                    <Button
                      type="button"
                      disabled={submitting}
                      onClick={() => submitSale(true)}
                    >
                      {submitting ? 'Salvando...' : needsBackdateApproval ? 'Enviar para aprovação' : 'Confirmar com entregador'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        )}
    </>
  );
}
