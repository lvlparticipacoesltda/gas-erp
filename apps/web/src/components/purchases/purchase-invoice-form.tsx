'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { SupplierPicker, type PurchaseSupplier } from '@/components/supplier-picker';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { parsePrice } from '@/lib/sale-utils';
import {
  DEFAULT_PURCHASE_PAYMENT_CATEGORY,
  PURCHASE_PAYMENT_CATEGORIES,
  type PaginatedResponse,
} from '@gas-erp/shared';

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface StoreOption {
  id: string;
  name: string;
}

interface DraftItem {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  paymentDate: string;
}

interface DraftPayment {
  key: string;
  category: string;
  dueDate: string;
  amount: number;
  installment: number;
}

function todayKey(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

function itemTotal(item: { quantity: number; unitPrice: number; discount: number }): number {
  return Math.max(0, item.quantity * item.unitPrice - item.discount);
}

export interface PurchaseInvoiceFormProps {
  /** Loja pré-selecionada (modo loja). */
  initialStoreId?: string;
  /** Lista de unidades para o seletor (modo master). */
  stores?: StoreOption[];
  /** Exibe o seletor de unidade no cabeçalho (modo master). */
  showStorePicker?: boolean;
  /** Título do cabeçalho. */
  title?: string;
  /** Rota de retorno após salvar/cancelar. */
  backHref: string;
}

export function PurchaseInvoiceForm({
  initialStoreId = '',
  stores,
  showStorePicker = false,
  title = 'Cadastrar compra',
  backHref,
}: PurchaseInvoiceFormProps) {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  // Cabeçalho
  const [storeId, setStoreId] = useState(initialStoreId);
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState(todayKey());
  const [supplier, setSupplier] = useState<PurchaseSupplier | null>(null);

  // Item em edição
  const [itemForm, setItemForm] = useState({
    productId: '',
    quantity: 1,
    unitPrice: 0,
    discount: 0,
    paymentDate: todayKey(),
  });
  const [items, setItems] = useState<DraftItem[]>([]);

  // Parcela em edição
  const [paymentForm, setPaymentForm] = useState({
    category: DEFAULT_PURCHASE_PAYMENT_CATEGORY as string,
    dueDate: todayKey(),
    amount: 0,
  });
  const [payments, setPayments] = useState<DraftPayment[]>([]);

  useEffect(() => {
    // Produtos são escopados por organização; carregamos toda a lista para
    // funcionar tanto no modo loja quanto no master (sem loja definida).
    api<PaginatedResponse<Product>>(`/products?pageSize=200`, {}, getToken())
      .then((res) => {
        setProducts(res.data);
        if (res.data[0]) setItemForm((f) => ({ ...f, productId: res.data[0].id }));
      })
      .finally(() => setReady(true));
  }, []);

  const itemsTotal = useMemo(() => items.reduce((sum, it) => sum + itemTotal(it), 0), [items]);
  const paymentsTotal = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments],
  );

  function addItem() {
    setError('');
    const product = products.find((p) => p.id === itemForm.productId);
    if (!product) {
      setError('Selecione um produto.');
      return;
    }
    if (itemForm.quantity <= 0) {
      setError('Quantidade deve ser maior que zero.');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: product.id,
        productName: product.name,
        quantity: itemForm.quantity,
        unitPrice: itemForm.unitPrice,
        discount: itemForm.discount,
        paymentDate: itemForm.paymentDate,
      },
    ]);
    setItemForm((f) => ({ ...f, quantity: 1, unitPrice: 0, discount: 0 }));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function addPayment() {
    setError('');
    if (paymentForm.amount <= 0) {
      setError('Informe o valor da parcela.');
      return;
    }
    setPayments((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        category: paymentForm.category,
        dueDate: paymentForm.dueDate,
        amount: paymentForm.amount,
        installment: prev.length + 1,
      },
    ]);
    setPaymentForm((f) => ({ ...f, amount: 0 }));
  }

  function removePayment(key: string) {
    setPayments((prev) =>
      prev
        .filter((p) => p.key !== key)
        .map((p, index) => ({ ...p, installment: index + 1 })),
    );
  }

  async function handleImport() {
    setError('');
    if (showStorePicker && !storeId) {
      setError('Selecione a unidade.');
      return;
    }
    setImporting(true);
    try {
      const res = await api<{ message: string }>(
        '/purchase-invoices/import',
        { method: 'POST', body: JSON.stringify({ storeId }) },
        getToken(),
      );
      setError(res.message || 'Importação de NF-e ainda não disponível (stub).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível importar a nota.');
    } finally {
      setImporting(false);
    }
  }

  async function handleSave() {
    setError('');
    if (showStorePicker && !storeId) {
      setError('Selecione a unidade.');
      return;
    }
    if (!supplier) {
      setError('Selecione o fornecedor.');
      return;
    }
    if (!number.trim()) {
      setError('Informe o número da nota.');
      return;
    }
    if (items.length === 0) {
      setError('Adicione ao menos um item.');
      return;
    }

    setSaving(true);
    try {
      await api(
        '/purchase-invoices',
        {
          method: 'POST',
          body: JSON.stringify({
            storeId,
            supplierId: supplier.id,
            number: number.trim(),
            issueDate,
            items: items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              discount: it.discount,
              paymentDate: it.paymentDate || undefined,
            })),
            payments: payments.length
              ? payments.map((p) => ({
                  category: p.category,
                  dueDate: p.dueDate,
                  amount: p.amount,
                  installment: p.installment,
                }))
              : undefined,
          }),
        },
        getToken(),
      );
      router.push(backHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a compra');
      setSaving(false);
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title={title}
        action={
          <div className="flex gap-2">
            <Button type="button" onClick={handleImport} disabled={importing}>
              {importing ? 'Importando…' : 'Utilizar dados da nota'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.push(backHref)}>
              Voltar
            </Button>
          </div>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </p>
      )}

      {/* Dados da compra */}
      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Dados da compra
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {showStorePicker && (
            <div>
              <Label>Unidade</Label>
              <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Selecione a unidade</option>
                {(stores ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>Número</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="0243995" />
          </div>
          <div>
            <Label>Data da nota</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <SupplierPicker value={supplier} onChange={setSupplier} />
          </div>
        </div>
      </Card>

      {/* Itens */}
      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Itens</h2>
        <div className="grid items-end gap-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Produto</Label>
            <Select
              value={itemForm.productId}
              onChange={(e) => setItemForm((f) => ({ ...f, productId: e.target.value }))}
            >
              {products.length === 0 && <option value="">Nenhum produto</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input
              type="number"
              min={1}
              value={itemForm.quantity}
              onChange={(e) => setItemForm((f) => ({ ...f, quantity: Math.max(0, Number(e.target.value)) }))}
            />
          </div>
          <div>
            <Label>Valor unitário</Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={itemForm.unitPrice}
              onChange={(e) => setItemForm((f) => ({ ...f, unitPrice: parsePrice(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Desconto</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={itemForm.discount}
              onChange={(e) => setItemForm((f) => ({ ...f, discount: parsePrice(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Data de pagamento</Label>
            <Input
              type="date"
              value={itemForm.paymentDate}
              onChange={(e) => setItemForm((f) => ({ ...f, paymentDate: e.target.value }))}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button type="button" onClick={addItem}>
            Adicionar
          </Button>
        </div>

        <div className="mt-5">
          <Table>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Produto</th>
                <th className="p-3">Quantidade</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Desconto</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.key} className="border-t border-slate-100">
                  <td className="p-3">{it.productName}</td>
                  <td className="p-3">{it.quantity}</td>
                  <td className="p-3">{formatCurrency(it.quantity * it.unitPrice)}</td>
                  <td className="p-3">{formatCurrency(it.discount)}</td>
                  <td className="p-3 text-right">
                    <Button type="button" variant="danger" onClick={() => removeItem(it.key)}>
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-slate-400">
                    Nenhum item adicionado.
                  </td>
                </tr>
              )}
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="p-3">Total</td>
                <td className="p-3">-</td>
                <td className="p-3">{formatCurrency(itemsTotal)}</td>
                <td className="p-3">-</td>
                <td className="p-3" />
              </tr>
            </tbody>
          </Table>
        </div>
      </Card>

      {/* Pagamentos */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pagamentos
        </h2>
        <div className="grid items-end gap-4 md:grid-cols-4">
          <div>
            <Label>Categoria &gt; Subcategoria</Label>
            <Select
              value={paymentForm.category}
              onChange={(e) => setPaymentForm((f) => ({ ...f, category: e.target.value }))}
            >
              {PURCHASE_PAYMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Data de pagamento</Label>
            <Input
              type="date"
              value={paymentForm.dueDate}
              onChange={(e) => setPaymentForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((f) => ({ ...f, amount: parsePrice(e.target.value) }))}
            />
          </div>
          <div>
            <Button type="button" variant="secondary" onClick={addPayment}>
              Adicionar Parcela
            </Button>
          </div>
        </div>

        {payments.length > 0 && (
          <div className="mt-5">
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Parcela</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Data de pagamento</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.key} className="border-t border-slate-100">
                    <td className="p-3">{p.installment}</td>
                    <td className="p-3">{p.category}</td>
                    <td className="p-3">{p.dueDate}</td>
                    <td className="p-3">{formatCurrency(p.amount)}</td>
                    <td className="p-3 text-right">
                      <Button type="button" variant="danger" onClick={() => removePayment(p.key)}>
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">Total da nota: {formatCurrency(itemsTotal)}</span>
            {payments.length > 0 && (
              <span className="ml-3">
                Parcelas: {formatCurrency(paymentsTotal)}
                {Math.abs(paymentsTotal - itemsTotal) > 0.009 ? (
                  <span className="ml-2 text-amber-700">(difere do total dos itens)</span>
                ) : null}
              </span>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Sem parcelas, será criada uma única parcela em &ldquo;{DEFAULT_PURCHASE_PAYMENT_CATEGORY}&rdquo;.
            </p>
          </div>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </Card>
    </>
  );
}
