'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { FilterPanel } from '@/components/filter-panel';
import { PaginatedSection } from '@/components/paginated-section';
import { useConfirm } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STORE_FILTER_ORG,
  type PaginatedResponse,
} from '@gas-erp/shared';
import { CategoryIcon } from './category-icon';
import { ExpenseCategoryCards } from './expense-category-manager';
import { ExpensesByCategoryChart, ExpensesTrendChart } from './expense-charts';
import { ExpenseFormModal } from './expense-form-modal';
import type { Expense, ExpenseCategory, ExpenseScope, ExpenseSummary, StoreOption } from './types';

const PAGE_SIZE = 15;

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Mês corrente no fuso local, como `AAAA-MM`. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthBounds(month: string): { dateFrom: string; dateTo: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function monthTitle(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTH_NAMES[monthNumber - 1]} / ${year}`;
}

function statusTone(status: Expense['status']): 'success' | 'warning' | 'danger' {
  if (status === 'PAID') return 'success';
  if (status === 'CANCELLED') return 'danger';
  return 'warning';
}

export function ExpensesPanel({ scope }: { scope: ExpenseScope }) {
  const [month, setMonth] = useState(currentMonth);
  const [storeFilter, setStoreFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [filteredTotal, setFilteredTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const confirm = useConfirm();
  const toast = useToast();

  const query = useMemo(() => {
    const { dateFrom, dateTo } = monthBounds(month);
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (scope.mode === 'store') params.set('storeId', scope.storeId);
    else if (storeFilter) params.set('storeId', storeFilter);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    return params.toString();
  }, [month, scope, storeFilter, categoryFilter, statusFilter, search]);

  const loadCategories = useCallback(() => {
    api<ExpenseCategory[]>('/expenses/categories', {}, getToken())
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    loadCategories();
    if (scope.mode === 'master') {
      api<StoreOption[]>('/stores', {}, getToken())
        .then(setStores)
        .catch(() => setStores([]));
    }
  }, [loadCategories, scope.mode]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api<PaginatedResponse<Expense> & { filteredTotal: number }>(
        `/expenses?${query}&page=${page}&pageSize=${PAGE_SIZE}`,
        {},
        getToken(),
      ),
      api<ExpenseSummary>(`/expenses/summary?${query}`, {}, getToken()),
    ])
      .then(([list, summaryData]) => {
        setExpenses(list.data);
        setTotalPages(list.totalPages);
        setTotal(list.total);
        setFilteredTotal(list.filteredTotal);
        setSummary(summaryData);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os gastos.');
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, [query, page]);

  useEffect(() => {
    load();
  }, [load]);

  function resetFilters() {
    setStoreFilter('');
    setCategoryFilter('');
    setStatusFilter('');
    setSearchInput('');
    setSearch('');
    setMonth(currentMonth());
  }

  async function handlePay(expense: Expense) {
    try {
      await api(`/expenses/${expense.id}/pay`, { method: 'POST', body: '{}' }, getToken());
      toast.success('Gasto marcado como pago.', expense.description);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível marcar como pago.');
    }
  }

  async function handleDelete(expense: Expense) {
    const ok = await confirm({
      title: 'Excluir gasto',
      description: (
        <>
          <strong className="font-semibold text-slate-800">{expense.description}</strong> —{' '}
          {formatCurrency(expense.amount)}. Esta ação é irreversível.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/expenses/${expense.id}`, { method: 'DELETE' }, getToken());
      toast.success('Gasto excluído.');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir o gasto.');
    }
  }

  function handleExport() {
    const token = getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    // O download precisa do header Authorization, então baixamos via fetch + blob.
    fetch(`${apiUrl}/expenses/export?${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gastos-${month}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError('Não foi possível exportar o CSV.'));
  }

  if (!ready && loading) return <PageLoader label="Carregando gastos…" />;

  return (
    <>
      <PageHeader
        title="Gastos da Empresa"
        subtitle="Controle todos os gastos da empresa em um só lugar"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Novo gasto
            </Button>
          </div>
        }
      />

      <FilterPanel
        onSearch={() => setSearch(searchInput.trim())}
        onReset={resetFilters}
        searching={loading}
      >
        <div>
          <Label>Mês / Ano</Label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium">
              {monthTitle(month)}
            </span>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {scope.mode === 'master' && (
          <div>
            <Label>Unidade</Label>
            <Select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="">Todas as unidades</option>
              <option value={EXPENSE_STORE_FILTER_ORG}>Empresa (rateado)</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <Label>Categoria</Label>
          <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Status</Label>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos</option>
            <option value="PENDING">Pendente</option>
            <option value="PAID">Pago</option>
            <option value="CANCELLED">Cancelado</option>
          </Select>
        </div>

        <div>
          <Label>Buscar</Label>
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Descrição, fornecedor…"
          />
        </div>
      </FilterPanel>

      {error && <Alert className="mb-4">{error}</Alert>}

      {/* A coluna de resumo só aparece em 2xl: abaixo disso ela roubava os ~290px
          de que a tabela de 8 colunas precisa, e Status/Ações saíam da área
          visível atrás de um scroll horizontal. */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <PaginatedSection
            loading={loading}
            pagination={{
              page,
              totalPages,
              total,
              pageSize: PAGE_SIZE,
              onPageChange: setPage,
              // `px-2` alinha o "Exibindo…" com o padding das células, senão o
              // texto encosta na borda do card e destoa da coluna acima.
              className: 'mt-3 px-2',
            }}
          >
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-2 py-3">Data</th>
                  <th className="px-2 py-3">Descrição</th>
                  <th className="px-2 py-3">Categoria</th>
                  {scope.mode === 'master' && <th className="px-2 py-3">Unidade</th>}
                  <th className="px-2 py-3">Pagamento</th>
                  <th className="px-2 py-3">Valor</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={scope.mode === 'master' ? 8 : 7} className="p-8 text-center text-sm text-slate-500">
                      Nenhum gasto lançado neste período.
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => (
                    <tr key={expense.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-2 py-3">{formatDate(`${expense.expenseDate}T12:00:00`)}</td>
                      <td className="px-2 py-3">
                        <div className="font-medium text-slate-800">{expense.description}</div>
                        {/* Fornecedor e vencimento como linha secundária: são opcionais e
                            não justificam colunas próprias numa tabela já larga. */}
                        {expense.supplierLabel && (
                          <div className="text-xs text-slate-500">{expense.supplierLabel}</div>
                        )}
                        {expense.dueDate && expense.status === 'PENDING' && (
                          <div className="text-xs text-slate-400">
                            vence {formatDate(`${expense.dueDate}T12:00:00`)}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <CategoryIcon
                            icon={expense.category.icon}
                            color={expense.category.color}
                            className="h-6 w-6 shrink-0"
                          />
                          {expense.category.name}
                        </span>
                      </td>
                      {scope.mode === 'master' && (
                        <td className="px-2 py-3 text-slate-600">
                          {expense.store?.name ?? (
                            <span className="text-slate-400">Empresa (rateado)</span>
                          )}
                        </td>
                      )}
                      <td className="px-2 py-3">
                        {expense.paymentLabel ? <Badge>{expense.paymentLabel}</Badge> : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 font-semibold tabular-nums">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-2 py-3">
                        <Badge tone={statusTone(expense.status)}>
                          {EXPENSE_STATUS_LABELS[expense.status]}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-1">
                          {expense.status === 'PENDING' && (
                            <button
                              type="button"
                              title="Marcar como pago"
                              onClick={() => handlePay(expense)}
                              className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"
                            >
                              <Wallet className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => {
                              setEditing(expense);
                              setFormOpen(true);
                            }}
                            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Excluir"
                            onClick={() => handleDelete(expense)}
                            className="rounded-lg p-1 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {expenses.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    {/* Células vazias no lugar das colunas que o total não usa:
                        assim o rótulo cai sob "Descrição" e o valor sob "Valor". */}
                    <td className="px-2 py-3" />
                    <td className="px-2 py-3">Total do período</td>
                    <td colSpan={scope.mode === 'master' ? 3 : 2} className="px-2 py-3" />
                    <td className="whitespace-nowrap px-2 py-3 tabular-nums">
                      {formatCurrency(filteredTotal)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </Table>
          </PaginatedSection>
        </div>

        {/* Empilhado abaixo da tabela os cartões se espalham em grade; virando
            coluna lateral em 2xl, voltam a ficar um sob o outro. */}
        <aside className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-1">
          {/* Ocupando a largura toda, o resumo vira uma faixa de três números —
              como cartão de uma coluna só ele ficava com metade vazia ao lado
              do gráfico de categorias. */}
          <Card className="sm:col-span-2 lg:col-span-3 2xl:col-span-1">
            <div className="text-sm font-semibold text-slate-700">Resumo do período</div>
            <div className="mt-3 grid gap-4 md:grid-cols-3 2xl:grid-cols-2">
              <div className="2xl:col-span-2">
                <div className="text-sm text-slate-500">Total de gastos</div>
                <div className="text-3xl font-extrabold text-rose-600">
                  {formatCurrency(summary?.total ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pago</div>
                <div className="text-lg font-semibold text-emerald-600 2xl:text-base">
                  {formatCurrency(summary?.paid ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pendente</div>
                <div className="text-lg font-semibold text-amber-600 2xl:text-base">
                  {formatCurrency(summary?.pending ?? 0)}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-1 text-sm font-semibold text-slate-700">Gastos por categoria</div>
            {summary && <ExpensesByCategoryChart summary={summary} />}
          </Card>

          <Card>
            <div className="mb-1 text-sm font-semibold text-slate-700">
              Evolução dos gastos
              <span className="ml-1 font-normal text-slate-400">· últimos 6 meses</span>
            </div>
            {summary && <ExpensesTrendChart summary={summary} />}
          </Card>

          {scope.mode === 'master' && summary && summary.byStore.length > 0 && (
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">Gastos por unidade</div>
              <ul className="space-y-2 text-sm">
                {summary.byStore.map((row) => (
                  <li
                    key={row.storeId ?? 'org'}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate text-slate-600">{row.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatCurrency(row.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>

      <ExpenseCategoryCards categories={categories} summary={summary} onChanged={loadCategories} />

      <ExpenseFormModal
        open={formOpen}
        scope={scope}
        categories={categories}
        stores={stores}
        expense={editing}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
    </>
  );
}
