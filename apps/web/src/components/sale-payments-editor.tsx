'use client';

import { useMemo } from 'react';
import { Button, Input, Label, Select } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { parsePrice } from '@/lib/sale-utils';

export interface StorePaymentMethodOption {
  id: string;
  label: string;
  systemCode: string | null;
  enabled?: boolean;
}

export interface SalePaymentLine {
  key: string;
  storePaymentMethodId: string;
  amount: number;
}

interface SalePaymentsEditorProps {
  methods: StorePaymentMethodOption[];
  lines: SalePaymentLine[];
  onChange: (lines: SalePaymentLine[]) => void;
  saleTotal: number;
  disabled?: boolean;
  gdpLocked?: boolean;
  gdpMethodId?: string;
  className?: string;
}

function newLineKey() {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultPaymentLines(
  methods: StorePaymentMethodOption[],
  saleTotal: number,
  preferredMethodId?: string,
): SalePaymentLine[] {
  const method =
    methods.find((m) => m.id === preferredMethodId)
    ?? methods.find((m) => m.systemCode === 'CASH')
    ?? methods[0];
  if (!method) return [];
  return [{ key: newLineKey(), storePaymentMethodId: method.id, amount: saleTotal }];
}

export function SalePaymentsEditor({
  methods,
  lines,
  onChange,
  saleTotal,
  disabled = false,
  gdpLocked = false,
  gdpMethodId,
  className,
}: SalePaymentsEditorProps) {
  const paidTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (line.amount || 0), 0),
    [lines],
  );
  const remaining = saleTotal - paidTotal;
  const mismatch = Math.abs(remaining) > 0.009;

  const availableMethods = gdpLocked && gdpMethodId
    ? methods.filter((m) => m.id === gdpMethodId)
    : methods.filter((m) => m.systemCode !== 'GDP');

  function updateLine(key: string, patch: Partial<SalePaymentLine>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const method = availableMethods[0];
    if (!method) return;
    const amount = Math.max(0, Number(remaining.toFixed(2)));
    onChange([
      ...lines,
      { key: newLineKey(), storePaymentMethodId: method.id, amount },
    ]);
  }

  function removeLine(key: string) {
    if (lines.length <= 1) return;
    onChange(lines.filter((line) => line.key !== key));
  }

  if (gdpLocked && gdpMethodId) {
    return (
      <div className={className}>
        <p className="rounded-lg border border-brand bg-brand-muted px-3 py-2 text-sm text-brand-dark">
          Pagamento registrado como <strong>GDP</strong> (Benefício Gás do Povo) —{' '}
          {formatCurrency(saleTotal)}
        </p>
      </div>
    );
  }

  if (availableMethods.length === 0) {
    return (
      <p className="text-sm text-amber-800">
        Nenhuma forma de pagamento ativa. Configure em Formas de pagamento.
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {lines.map((line) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
            <div>
              <Label>Forma</Label>
              <Select
                value={line.storePaymentMethodId}
                disabled={disabled}
                onChange={(e) => updateLine(line.key, { storePaymentMethodId: e.target.value })}
              >
                {availableMethods.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                disabled={disabled}
                value={line.amount || ''}
                onChange={(e) => updateLine(line.key, { amount: parsePrice(e.target.value) })}
              />
            </div>
            <Button
              type="button"
              variant="danger"
              disabled={disabled || lines.length <= 1}
              onClick={() => removeLine(line.key)}
            >
              Remover
            </Button>
          </div>
        ))}
      </div>

      {!disabled && lines.length < availableMethods.length ? (
        <Button type="button" variant="secondary" className="mt-3" onClick={addLine}>
          + Adicionar forma de pagamento
        </Button>
      ) : null}

      <div className="mt-3 text-sm">
        <span className="font-medium text-slate-900">Total da venda: {formatCurrency(saleTotal)}</span>
        <span className="mx-2 text-slate-400">·</span>
        <span className={mismatch ? 'font-medium text-amber-800' : 'text-slate-600'}>
          Informado: {formatCurrency(paidTotal)}
          {mismatch ? ` (faltam ${formatCurrency(Math.abs(remaining))})` : ''}
        </span>
      </div>
    </div>
  );
}

export function salePaymentLinesToPayload(lines: SalePaymentLine[]) {
  return lines.map((line) => ({
    storePaymentMethodId: line.storePaymentMethodId,
    amount: line.amount,
  }));
}

export function paymentsMatchTotal(lines: SalePaymentLine[], saleTotal: number): boolean {
  const paid = lines.reduce((sum, line) => sum + line.amount, 0);
  return Math.abs(paid - saleTotal) <= 0.009;
}
