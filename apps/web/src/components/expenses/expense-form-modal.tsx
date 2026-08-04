'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import { SupplierPicker, type PurchaseSupplier } from '@/components/supplier-picker';
import { Alert, Button, Input, Label, Select } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { EXPENSE_PAYMENT_LABELS } from '@gas-erp/shared';
import type { Expense, ExpenseCategory, ExpenseScope, StoreOption } from './types';

function todayKey(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

type FormState = {
  storeId: string;
  categoryId: string;
  description: string;
  expenseDate: string;
  dueDate: string;
  amount: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  paidAt: string;
  paymentLabel: string;
  notes: string;
  installments: string;
};

function emptyForm(scope: ExpenseScope, categoryId: string): FormState {
  return {
    storeId: scope.mode === 'store' ? scope.storeId : '',
    categoryId,
    description: '',
    expenseDate: todayKey(),
    dueDate: '',
    amount: '',
    status: 'PENDING',
    paidAt: '',
    paymentLabel: '',
    notes: '',
    installments: '1',
  };
}

export function ExpenseFormModal({
  open,
  scope,
  categories,
  stores,
  expense,
  onClose,
  onSaved,
}: {
  open: boolean;
  scope: ExpenseScope;
  categories: ExpenseCategory[];
  stores: StoreOption[];
  /** Preenchido = edição; nulo = novo gasto. */
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm(scope, categories[0]?.id ?? ''));
  const [supplier, setSupplier] = useState<PurchaseSupplier | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Dependências primitivas: recarregar a lista de categorias não pode zerar o
  // formulário que o usuário já está preenchendo.
  const defaultCategoryId = categories[0]?.id ?? '';
  const scopeStoreId = scope.mode === 'store' ? scope.storeId : '';

  useEffect(() => {
    if (!open) return;
    setError('');
    if (expense) {
      setForm({
        storeId: expense.store?.id ?? '',
        categoryId: expense.category.id,
        description: expense.description,
        expenseDate: expense.expenseDate,
        dueDate: expense.dueDate ?? '',
        amount: String(expense.amount),
        status: expense.status,
        paidAt: expense.paidAt ?? '',
        paymentLabel: expense.paymentLabel ?? '',
        notes: expense.notes ?? '',
        installments: '1',
      });
      setSupplier(
        expense.supplierId
          ? { id: expense.supplierId, legalName: expense.supplierLabel ?? '' }
          : null,
      );
    } else {
      setForm({
        ...emptyForm(scope, defaultCategoryId),
        storeId: scopeStoreId,
      });
      setSupplier(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense, defaultCategoryId, scopeStoreId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const amount = Number(form.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    if (form.status === 'PAID' && !form.paidAt) {
      setError('Informe a data do pagamento.');
      return;
    }

    const payload = {
      storeId: form.storeId || undefined,
      categoryId: form.categoryId,
      description: form.description.trim(),
      expenseDate: form.expenseDate,
      dueDate: form.dueDate || undefined,
      paidAt: form.status === 'PAID' ? form.paidAt : undefined,
      amount,
      status: form.status,
      supplierId: supplier?.id,
      paymentLabel: form.paymentLabel || undefined,
      notes: form.notes || undefined,
      installments: expense ? undefined : Number(form.installments) || 1,
    };

    setSaving(true);
    try {
      if (expense) {
        await api(
          `/expenses/${expense.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              ...payload,
              storeId: form.storeId || null,
              dueDate: form.dueDate || null,
              paidAt: form.status === 'PAID' ? form.paidAt : null,
              supplierId: supplier?.id ?? null,
              paymentLabel: form.paymentLabel || null,
              notes: form.notes || null,
              installments: undefined,
            }),
          },
          getToken(),
        );
      } else {
        await api('/expenses', { method: 'POST', body: JSON.stringify(payload) }, getToken());
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o gasto.');
    } finally {
      setSaving(false);
    }
  }

  const repeatCount = Number(form.installments) || 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Editar gasto' : 'Novo gasto'}
      subtitle={
        expense
          ? 'Alterações refletem no custo líquido do período.'
          : 'A data de competência define o mês em que o gasto entra no resultado.'
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Descrição</Label>
          <Input
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="Ex.: Conta de luz - unidade Santos"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Categoria</Label>
            <Select
              value={form.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => set('amount', event.target.value)}
              placeholder="0,00"
              required
            />
          </div>
        </div>

        {scope.mode === 'master' && (
          <div>
            <Label>Unidade</Label>
            <Select value={form.storeId} onChange={(event) => set('storeId', event.target.value)}>
              <option value="">Empresa (rateado entre as unidades)</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              Sem unidade, o gasto é rateado no lucro líquido de cada loja conforme o faturamento
              do período.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Competência</Label>
            <Input
              type="date"
              value={form.expenseDate}
              onChange={(event) => set('expenseDate', event.target.value)}
              required
            />
          </div>
          <div>
            <Label>Vencimento</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => set('dueDate', event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onChange={(event) => set('status', event.target.value as FormState['status'])}
            >
              <option value="PENDING">Pendente</option>
              <option value="PAID">Pago</option>
              <option value="CANCELLED">Cancelado</option>
            </Select>
          </div>
          {form.status === 'PAID' && (
            <div>
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={form.paidAt}
                onChange={(event) => set('paidAt', event.target.value)}
                required
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Forma de pagamento</Label>
            <Input
              list="expense-payment-labels"
              value={form.paymentLabel}
              onChange={(event) => set('paymentLabel', event.target.value)}
              placeholder="PIX, Boleto, DAS…"
            />
            <datalist id="expense-payment-labels">
              {EXPENSE_PAYMENT_LABELS.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          {!expense && (
            <div>
              <Label>Repetir por (meses)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={form.installments}
                onChange={(event) => set('installments', event.target.value)}
              />
              {repeatCount > 1 && (
                <p className="mt-1 text-xs text-slate-500">
                  Cria {repeatCount} lançamentos mensais com o mesmo valor.
                </p>
              )}
            </div>
          )}
        </div>

        {/* O SupplierPicker já renderiza o próprio rótulo "Fornecedor". */}
        <SupplierPicker value={supplier} onChange={setSupplier} />

        <div>
          <Label>Observações</Label>
          <Input value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </div>

        {error && (
          <Alert>{error}</Alert>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
