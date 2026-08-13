'use client';

import { useState } from 'react';
import { Button, Input, Label, Select } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { parsePrice } from '@/lib/sale-utils';

export type EditableSaleLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  storePaymentMethodId?: string;
};

export type CatalogProduct = {
  id: string;
  name: string;
  productType?: string;
  storeSettings?: { price: number | string }[];
};

interface SaleItemsEditorProps {
  products: CatalogProduct[];
  items: EditableSaleLine[];
  onChange: (items: EditableSaleLine[]) => void;
  resolveUnitPrice: (productId: string) => number;
  defaultPaymentMethodId?: string | null;
  assignPaymentMethod?: boolean;
}

export function storeCatalogPrice(product?: CatalogProduct): number {
  return parsePrice(product?.storeSettings?.[0]?.price);
}

export function SaleItemsEditor({
  products,
  items,
  onChange,
  resolveUnitPrice,
  defaultPaymentMethodId,
  assignPaymentMethod = false,
}: SaleItemsEditorProps) {
  const [addProductId, setAddProductId] = useState('');
  const inCart = new Set(items.map((item) => item.productId));
  const availableToAdd = products.filter((p) => !inCart.has(p.id));

  function addSelected() {
    const productId = addProductId || availableToAdd[0]?.id;
    if (!productId) return;
    const existing = items.find((item) => item.productId === productId);
    if (existing) {
      onChange(
        items.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item,
        ),
      );
    } else {
      onChange([
        ...items,
        {
          productId,
          quantity: 1,
          unitPrice: resolveUnitPrice(productId),
          storePaymentMethodId: assignPaymentMethod
            ? (defaultPaymentMethodId || undefined)
            : undefined,
        },
      ]);
    }
    setAddProductId('');
  }

  function updateLine(productId: string, patch: Partial<EditableSaleLine>) {
    onChange(items.map((item) => (item.productId === productId ? { ...item, ...patch } : item)));
  }

  function removeLine(productId: string) {
    onChange(items.filter((item) => item.productId !== productId));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <Label>Adicionar produto</Label>
          <Select
            value={addProductId}
            onChange={(e) => setAddProductId(e.target.value)}
          >
            <option value="">Selecione...</option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatCurrency(resolveUnitPrice(p.id))}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" variant="secondary" onClick={addSelected} disabled={availableToAdd.length === 0}>
          Adicionar
        </Button>
      </div>

      {items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const name = product?.name ?? 'Produto';
        return (
          <div
            key={item.productId}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="min-w-[120px] flex-1 font-medium">{name}</div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateLine(item.productId, { quantity: Math.max(1, item.quantity - 1) })}
              >
                −
              </Button>
              <span className="w-8 text-center font-semibold">{item.quantity}</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateLine(item.productId, { quantity: item.quantity + 1 })}
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
                onChange={(e) => updateLine(item.productId, { unitPrice: Number(e.target.value) })}
              />
            </div>
            <div className="ml-auto text-right text-sm font-semibold text-slate-900">
              {formatCurrency(item.quantity * item.unitPrice)}
            </div>
            <Button type="button" variant="danger" onClick={() => removeLine(item.productId)}>
              Remover
            </Button>
          </div>
        );
      })}
    </div>
  );
}
