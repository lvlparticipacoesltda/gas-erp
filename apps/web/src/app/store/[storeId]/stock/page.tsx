'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { PaginatedSection } from '@/components/paginated-section';
import { Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { FilterBar, FilterField } from '@/components/filters';
import { api, getStoredUser, getToken } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import {
  canManageStock,
  getSaleBusinessDayKey,
  todayDateKey,
  type PaginatedResponse,
} from '@gas-erp/shared';

interface MovementTransfer {
  id: string;
  fromStoreId: string;
  toStoreId: string;
  fromStoreName: string;
  toStoreName: string;
  completedAt?: string | null;
}

interface Movement {
  id: string;
  createdAt: string;
  quantity: number;
  type: string;
  reason: string;
  product: { name: string };
  user?: { name: string };
  transfer?: MovementTransfer | null;
}

function movementTypeLabel(type: string) {
  return type === 'IN' ? 'Entrada' : type === 'OUT' ? 'Saída' : type;
}

function movementReasonLabel(movement: Movement, storeId: string) {
  if (movement.transfer) {
    if (movement.type === 'OUT' && movement.transfer.fromStoreId === storeId) {
      return `Transferência para ${movement.transfer.toStoreName}`;
    }
    if (movement.type === 'IN' && movement.transfer.toStoreId === storeId) {
      return `Transferência recebida de ${movement.transfer.fromStoreName}`;
    }
    if (movement.type === 'OUT') {
      return `Transferência para ${movement.transfer.toStoreName}`;
    }
    return `Transferência recebida de ${movement.transfer.fromStoreName}`;
  }
  return movement.reason;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  stockBalances?: { available: number; inTransit: number; lent: number }[];
}

export default function StockPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const currentUser = getStoredUser<{ role: string }>();
  const canEditStock = currentUser ? canManageStock(currentUser.role) : false;
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustForm, setAdjustForm] = useState({ productId: '', quantity: 0, reason: 'Ajuste manual de estoque' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [ready, setReady] = useState(false);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsTotalPages, setMovementsTotalPages] = useState(1);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [useDateRange, setUseDateRange] = useState(false);
  const [filterDate, setFilterDate] = useState('');

  const MOVEMENTS_PAGE_SIZE = 20;
  const loadGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const effectiveDateFrom = useDateRange ? dateFrom : filterDate;
  const effectiveDateTo = useDateRange ? dateTo : filterDate;

  const movementsQuery = useMemo(() => {
    const params = new URLSearchParams({
      storeId,
      page: String(movementsPage),
      pageSize: String(MOVEMENTS_PAGE_SIZE),
    });
    if (effectiveDateFrom || effectiveDateTo) {
      const from = effectiveDateFrom || effectiveDateTo;
      const to = effectiveDateTo || effectiveDateFrom;
      if (from === to) {
        params.set('date', from);
      } else {
        params.set('dateFrom', from);
        params.set('dateTo', to);
      }
    }
    return params.toString();
  }, [storeId, movementsPage, effectiveDateFrom, effectiveDateTo]);

  const filterFrom = effectiveDateFrom || effectiveDateTo;
  const filterTo = effectiveDateTo || effectiveDateFrom;

  async function loadProducts() {
    const res = await api<PaginatedResponse<Product>>(
      `/products?storeId=${storeId}&pageSize=100`,
      {},
      getToken(),
    );
    setProducts(res.data);
    if (!adjustForm.productId && res.data[0]) {
      setAdjustForm((f) => ({ ...f, productId: res.data[0].id }));
    }
  }

  function balanceFor(product: Product) {
    return product.stockBalances?.[0] ?? { available: 0, inTransit: 0, lent: 0 };
  }

  const loadMovements = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++loadGeneration.current;

    setMovements([]);
    setMovementsLoading(true);

    api<PaginatedResponse<Movement>>(
      `/stock/movements?${movementsQuery}`,
      { signal: controller.signal },
      getToken(),
    )
      .then((m) => {
        if (generation !== loadGeneration.current) return;
        setMovements(m.data);
        setMovementsTotalPages(m.totalPages);
        setMovementsTotal(m.total);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (generation !== loadGeneration.current) return;
      })
      .finally(() => {
        if (generation !== loadGeneration.current) return;
        setMovementsLoading(false);
      });
  }, [movementsQuery]);

  useEffect(() => {
    setMovementsPage(1);
    setReady(false);
    loadProducts()
      .catch(() => undefined)
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    setMovementsPage(1);
  }, [filterDate, dateFrom, dateTo, useDateRange, storeId]);

  useEffect(() => {
    if (!ready) return;
    loadMovements();
    return () => abortRef.current?.abort();
  }, [ready, loadMovements]);

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (!adjustForm.productId) {
      setFormError('Selecione um produto.');
      return;
    }
    if (adjustForm.quantity === 0) {
      setFormError('Informe a quantidade (positiva para entrada, negativa para saída).');
      return;
    }
    try {
      await api('/stock/adjust', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          productId: adjustForm.productId,
          quantity: adjustForm.quantity,
          reason: adjustForm.reason,
        }),
      }, getToken());
      setFormSuccess('Estoque atualizado com sucesso.');
      setAdjustForm((f) => ({ ...f, quantity: 0 }));
      await Promise.all([loadProducts(), loadMovements()]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao ajustar estoque');
    }
  }

  const mismatchedMovements =
    filterFrom && filterTo
      ? movements.filter((movement) => {
          const key = getSaleBusinessDayKey(new Date(movement.createdAt));
          return key < filterFrom || key > filterTo;
        })
      : [];

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
    <PageHeader title="Estoque" subtitle="Saldos e movimentações da unidade" />

      {canEditStock ? (
      <Card className="mb-8">
        <h2 className="mb-4 font-semibold">Ajustar estoque</h2>
        {formError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        )}
        {formSuccess && (
          <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{formSuccess}</p>
        )}
        {products.length === 0 ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Nenhum produto cadastrado nesta loja. Cadastre produtos em Produtos antes de ajustar o estoque.
          </p>
        ) : null}
        <form onSubmit={handleAdjust} className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Produto</Label>
            <Select
              value={adjustForm.productId}
              onChange={(e) => setAdjustForm({ ...adjustForm, productId: e.target.value })}
              required
              disabled={products.length === 0}
            >
              <option value="" disabled>
                Selecione um produto
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Quantidade (+ entrada / − saída)</Label>
            <Input
              type="number"
              value={adjustForm.quantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Motivo</Label>
            <Input
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              required
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Aplicar ajuste</Button>
          </div>
        </form>
      </Card>
      ) : null}

      <h2 className="mb-3 font-semibold">Saldos atuais</h2>
      <Table>
        <thead className="bg-slate-50 text-left">
          <tr><th className="p-3">Produto</th><th className="p-3">Disponível</th><th className="p-3">Trânsito</th><th className="p-3">Comodato</th></tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const balance = balanceFor(product);
            return (
            <tr key={product.id} className="border-t border-slate-100">
              <td className="p-3">{product.name}</td>
              <td className="p-3">{balance.available}</td>
              <td className="p-3">{balance.inTransit}</td>
              <td className="p-3">{balance.lent}</td>
            </tr>
            );
          })}
        </tbody>
      </Table>

      <h2 className="mb-3 mt-8 font-semibold">Movimentações recentes</h2>

      <FilterBar className="mb-4">
        {useDateRange ? (
          <>
            <FilterField label="De">
              <Input
                type="date"
                className="w-40 [color-scheme:light]"
                value={dateFrom}
                max={dateTo || todayDateKey()}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateFrom(value);
                  if (dateTo && value > dateTo) setDateTo(value);
                }}
              />
            </FilterField>
            <FilterField label="Até">
              <Input
                type="date"
                className="w-40 [color-scheme:light]"
                value={dateTo}
                min={dateFrom || undefined}
                max={todayDateKey()}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateTo(value);
                  if (dateFrom && value < dateFrom) setDateFrom(value);
                }}
              />
            </FilterField>
          </>
        ) : (
          <FilterField label="Data da movimentação">
            <Input
              type="date"
              className="w-44 [color-scheme:light]"
              value={filterDate}
              max={todayDateKey()}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </FilterField>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setUseDateRange((current) => !current);
              setDateFrom('');
              setDateTo('');
              setFilterDate('');
            }}
            className="text-xs font-medium text-brand hover:underline"
          >
            {useDateRange ? 'Filtrar por um dia' : 'Filtrar por período'}
          </button>
          {(filterDate || dateFrom || dateTo) && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setUseDateRange(false);
                setFilterDate('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              Todas as datas
            </Button>
          )}
        </div>
      </FilterBar>

      {mismatchedMovements.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Atenção: {mismatchedMovements.length} movimentação(ões) fora do intervalo selecionado. Atualize a página ou
          aguarde o deploy da API.
        </p>
      )}

      <PaginatedSection
        loading={movementsLoading}
        pagination={{
          className: 'mt-4',
          page: movementsPage,
          totalPages: movementsTotalPages,
          total: movementsTotal,
          pageSize: MOVEMENTS_PAGE_SIZE,
          onPageChange: setMovementsPage,
        }}
      >
      <Table>
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="p-3">Data e hora</th>
            <th className="p-3">Produto</th>
            <th className="p-3">Tipo</th>
            <th className="p-3">Qtd</th>
            <th className="p-3">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-t border-slate-100">
              <td className="p-3 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
              <td className="p-3">{m.product.name}</td>
              <td className="p-3">{movementTypeLabel(m.type)}</td>
              <td className="p-3">{m.quantity}</td>
              <td className="p-3">
                <div>{movementReasonLabel(m, storeId)}</div>
                {m.transfer && (
                  <div className="mt-0.5 text-xs text-slate-500">
                    {m.transfer.fromStoreName} → {m.transfer.toStoreName}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      </PaginatedSection>
    </>
  );
}
