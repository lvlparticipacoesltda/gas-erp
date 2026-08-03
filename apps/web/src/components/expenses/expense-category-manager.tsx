'use client';

import { useState } from 'react';
import { Modal } from '@/components/modal';
import { Button, Input, Label } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { CategoryIcon } from './category-icon';
import type { ExpenseCategory, ExpenseSummary } from './types';

const COLOR_CHOICES = [
  '#f97316',
  '#0ea5e9',
  '#eab308',
  '#8b5cf6',
  '#3b82f6',
  '#06b6d4',
  '#ef4444',
  '#64748b',
  '#14b8a6',
  '#ec4899',
  '#22c55e',
  '#94a3b8',
];

/** Cartões por categoria com o total do período + gestão de categorias. */
export function ExpenseCategoryCards({
  categories,
  summary,
  onChanged,
}: {
  categories: ExpenseCategory[];
  summary: ExpenseSummary | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_CHOICES[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const totalsByCategory = new Map(
    (summary?.byCategory ?? []).map((row) => [row.categoryId, row]),
  );

  function openNew() {
    setEditing(null);
    setName('');
    setColor(COLOR_CHOICES[0]);
    setError('');
    setOpen(true);
  }

  function openEdit(category: ExpenseCategory) {
    setEditing(category);
    setName(category.name);
    setColor(category.color ?? COLOR_CHOICES[0]);
    setError('');
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = JSON.stringify({ name: name.trim(), color });
      if (editing) {
        await api(`/expenses/categories/${editing.id}`, { method: 'PATCH', body }, getToken());
      } else {
        await api('/expenses/categories', { method: 'POST', body }, getToken());
      }
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!editing) return;
    if (!window.confirm(`Remover a categoria "${editing.name}"?`)) return;
    setSaving(true);
    try {
      await api(`/expenses/categories/${editing.id}`, { method: 'DELETE' }, getToken());
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover a categoria.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-semibold">Categorias de gastos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {categories.map((category) => {
          const stats = totalsByCategory.get(category.id);
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => openEdit(category)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-light hover:shadow-md"
            >
              <CategoryIcon
                icon={category.icon}
                color={category.color}
                className="mb-2 h-9 w-9"
              />
              <div className="truncate text-sm font-semibold text-slate-800">{category.name}</div>
              <div className="text-xs text-slate-500">
                {stats ? `${stats.count} ${stats.count === 1 ? 'item' : 'itens'}` : 'sem lançamentos'}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatCurrency(stats?.total ?? 0)}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={openNew}
          className="flex min-h-[7rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-medium text-slate-500 transition hover:border-brand hover:text-brand"
        >
          <span className="text-xl leading-none">+</span>
          Nova categoria
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar categoria' : 'Nova categoria'}
        subtitle={
          editing?.system
            ? 'Categoria padrão do sistema — pode ser renomeada, mas não excluída.'
            : undefined
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-label={`Cor ${choice}`}
                  onClick={() => setColor(choice)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    color === choice ? 'border-slate-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: choice }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-between gap-2 pt-2">
            {editing ? (
              <Button type="button" variant="danger" onClick={handleRemove} disabled={saving}>
                Remover
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </section>
  );
}
