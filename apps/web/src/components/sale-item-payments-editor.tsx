'use client';

import { formatCurrency } from '@/lib/utils';
import { Label, Select } from '@/components/ui';
import {
  aggregatePaymentsByMethodId,
  buildPaymentAllocationsFromItems,
} from '@gas-erp/shared';
import type { StorePaymentMethodOption } from '@/components/sale-payments-editor';

export interface SaleItemPaymentRow {
  key: string;
  label: string;
  quantity: number;
  unitPrice: number;
  storePaymentMethodId: string;
}

interface SaleItemPaymentsEditorProps {
  items: SaleItemPaymentRow[];
  onChangeItemMethod: (key: string, storePaymentMethodId: string) => void;
  deliveryFee: number;
  deliveryFeeStorePaymentMethodId: string;
  onChangeDeliveryFeeMethod: (storePaymentMethodId: string) => void;
  methods: StorePaymentMethodOption[];
  className?: string;
}

/** Métodos disponíveis: ativos + GDP (mesmo desativado no cadastro). */
export function paymentMethodsForSale(methods: StorePaymentMethodOption[]): StorePaymentMethodOption[] {
  return methods.filter((m) => m.enabled !== false || m.systemCode === 'GDP');
}

export function SaleItemPaymentsEditor({
  items,
  onChangeItemMethod,
  deliveryFee,
  deliveryFeeStorePaymentMethodId,
  onChangeDeliveryFeeMethod,
  methods,
  className,
}: SaleItemPaymentsEditorProps) {
  const available = paymentMethodsForSale(methods);
  const allocations = buildPaymentAllocationsFromItems(
    items.map((item) => ({
      storePaymentMethodId: item.storePaymentMethodId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    deliveryFee,
    deliveryFeeStorePaymentMethodId || null,
  );
  const summary = aggregatePaymentsByMethodId(allocations);

  if (available.length === 0) {
    return (
      <p className="text-sm text-amber-800">
        Nenhuma forma de pagamento disponível. Configure em Formas de pagamento.
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.key}
            className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_200px] sm:items-center"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">
                {item.quantity}x {item.label}
              </p>
              <p className="text-xs text-slate-500">{formatCurrency(item.quantity * item.unitPrice)}</p>
            </div>
            <div>
              <Label>Forma</Label>
              <Select
                value={item.storePaymentMethodId}
                onChange={(e) => onChangeItemMethod(item.key, e.target.value)}
              >
                {available.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ))}

        {deliveryFee > 0.009 ? (
          <div className="grid gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 sm:grid-cols-[1fr_200px] sm:items-center">
            <div>
              <p className="text-sm font-medium text-slate-900">Taxa de entrega</p>
              <p className="text-xs text-slate-500">{formatCurrency(deliveryFee)}</p>
            </div>
            <div>
              <Label>Forma</Label>
              <Select
                value={deliveryFeeStorePaymentMethodId}
                onChange={(e) => onChangeDeliveryFeeMethod(e.target.value)}
              >
                {available.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <p className="font-medium text-slate-900">Resumo por forma</p>
        <ul className="mt-1 space-y-0.5 text-slate-700">
          {summary.map((row) => {
            const method = available.find((m) => m.id === row.storePaymentMethodId);
            return (
              <li key={row.storePaymentMethodId}>
                {method?.label ?? '—'} — {formatCurrency(row.amount)}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
