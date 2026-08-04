'use client';

import { useState } from 'react';
import { ColorPicker } from '@/components/color-picker';
import { useConfirm } from '@/components/confirm-dialog';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Alert, Button, Input, Label } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { CategoryIcon } from './category-icon';
import type { ExpenseCategory, ExpenseSummary } from './types';

/** Cor inicial de uma categoria nova — o usuário escolhe qualquer tom no picker. */
const DEFAULT_COLOR = '#f97316';

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
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const confirm = useConfirm();
  const toast = useToast();

  const totalsByCategory = new Map(
    (summary?.byCategory ?? []).map((row) => [row.categoryId, row]),
  );

  function openNew() {
    setEditing(null);
    setName('');
    setColor(DEFAULT_COLOR);
    setError('');
    setOpen(true);
  }

  function openEdit(category: ExpenseCategory) {
    setEditing(category);
    setName(category.name);
    setColor(category.color ?? DEFAULT_COLOR);
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
      toast.success(editing ? 'Categoria atualizada.' : 'Categoria criada.', name.trim());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!editing) return;
    const ok = await confirm({
      title: 'Remover categoria',
      description: (
        <>
          A categoria <strong className="font-semibold text-slate-800">{editing.name}</strong> sai
          da lista. Os gastos já lançados nela não são apagados.
        </>
      ),
      confirmLabel: 'Remover',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api(`/expenses/categories/${editing.id}`, { method: 'DELETE' }, getToken());
      setOpen(false);
      toast.success('Categoria removida.');
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
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {error && <Alert>{error}</Alert>}

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
              <Button type="submit" loading={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </section>
  );
}
