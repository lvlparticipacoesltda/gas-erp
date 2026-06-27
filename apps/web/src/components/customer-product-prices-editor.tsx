'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Label, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { CustomerProductPriceRow, PaginatedResponse } from '@gas-erp/shared';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  storeSettings?: { price: number | string }[];
}

interface CustomerProductPricesEditorProps {
  customerId: string;
  storeId: string;
}

export function CustomerProductPricesEditor({ customerId, storeId }: CustomerProductPricesEditorProps) {
  const [rows, setRows] = useState<CustomerProductPriceRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState({ productId: '', price: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [prices, productPage] = await Promise.all([
        api<CustomerProductPriceRow[]>(
          `/customers/${customerId}/product-prices?storeId=${storeId}`,
          {},
          getToken(),
        ),
        api<PaginatedResponse<ProductOption>>(
          `/products?storeId=${storeId}&pageSize=100`,
          {},
          getToken(),
        ),
      ]);
      setRows(prices);
      setProducts(productPage.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar preços');
    } finally {
      setLoading(false);
    }
  }, [customerId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const configuredIds = new Set(rows.map((row) => row.productId));
  const availableProducts = products.filter((p) => !configuredIds.has(p.id));

  function defaultPrice(product: ProductOption): number {
    const parsed = Number(product.storeSettings?.[0]?.price ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function handleAdd() {
    if (!draft.productId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const created = await api<CustomerProductPriceRow>(
        `/customers/${customerId}/product-prices?storeId=${storeId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ productId: draft.productId, price: draft.price }),
        },
        getToken(),
      );
      setRows((prev) => [...prev.filter((row) => row.productId !== created.productId), created].sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR')));
      setDraft({ productId: '', price: 0 });
      setMessage('Preço especial salvo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar preço');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePrice(productId: string, price: number) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await api<CustomerProductPriceRow>(
        `/customers/${customerId}/product-prices?storeId=${storeId}`,
        { method: 'PUT', body: JSON.stringify({ productId, price }) },
        getToken(),
      );
      setRows((prev) => prev.map((row) => (row.productId === productId ? updated : row)));
      setMessage('Preço atualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar preço');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(productId: string) {
    if (!window.confirm('Remover preço especial deste produto?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(
        `/customers/${customerId}/product-prices/${productId}?storeId=${storeId}`,
        { method: 'DELETE' },
        getToken(),
      );
      setRows((prev) => prev.filter((row) => row.productId !== productId));
      setMessage('Preço especial removido.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover preço');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <h3 className="font-semibold">Preços especiais por produto</h3>
      <p className="mt-1 text-sm text-slate-600">
        Valores usados automaticamente na nova venda quando este cliente for selecionado (nesta loja).
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {message && (
        <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Carregando preços…</p>
      ) : (
        <>
          {rows.length > 0 && (
            <div className="mt-4">
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Preço padrão loja</th>
                  <th className="p-3">Preço do cliente</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CustomerPriceRow
                    key={row.id}
                    row={row}
                    disabled={saving}
                    onSave={(price) => handleUpdatePrice(row.productId, price)}
                    onRemove={() => handleRemove(row.productId)}
                  />
                ))}
              </tbody>
            </Table>
            </div>
          )}

          {rows.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">Nenhum preço especial configurado.</p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
            <div>
              <Label>Adicionar produto</Label>
              <Select
                className="mt-1 w-full"
                value={draft.productId}
                onChange={(e) => {
                  const product = availableProducts.find((p) => p.id === e.target.value);
                  setDraft({
                    productId: e.target.value,
                    price: product ? defaultPrice(product) : 0,
                  });
                }}
              >
                <option value="">Selecione</option>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku}) — padrão {formatCurrency(defaultPrice(product))}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                className="mt-1"
                value={draft.price}
                onChange={(e) => setDraft((prev) => ({ ...prev, price: Number(e.target.value) }))}
              />
            </div>
            <Button type="button" disabled={saving || !draft.productId} onClick={() => void handleAdd()}>
              Adicionar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function CustomerPriceRow({
  row,
  disabled,
  onSave,
  onRemove,
}: {
  row: CustomerProductPriceRow;
  disabled: boolean;
  onSave: (price: number) => void;
  onRemove: () => void;
}) {
  const [price, setPrice] = useState(row.price);

  useEffect(() => {
    setPrice(row.price);
  }, [row.price]);

  return (
    <tr className="border-t border-slate-100">
      <td className="p-3">
        {row.productName}
        <div className="text-xs text-slate-500">{row.productSku}</div>
      </td>
      <td className="p-3">{row.defaultStorePrice != null ? formatCurrency(row.defaultStorePrice) : '—'}</td>
      <td className="p-3">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={price}
          disabled={disabled}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || Math.abs(price - row.price) < 0.001}
            onClick={() => onSave(price)}
          >
            Salvar
          </Button>
          <Button type="button" variant="secondary" disabled={disabled} onClick={onRemove}>
            Remover
          </Button>
        </div>
      </td>
    </tr>
  );
}
