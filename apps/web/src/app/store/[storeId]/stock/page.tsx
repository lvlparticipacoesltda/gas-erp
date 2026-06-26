'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { Pagination } from '@/components/pagination';
import { Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { PaginatedResponse } from '@gas-erp/shared';

interface Movement {
  id: string;
  createdAt: string;
  quantity: number;
  type: string;
  reason: string;
  product: { name: string };
  user?: { name: string };
}

interface Balance {
  id: string;
  available: number;
  inTransit: number;
  lent: number;
  product: { id: string; name: string; sku: string };
}

export default function StockPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [adjustForm, setAdjustForm] = useState({ productId: '', quantity: 0, reason: 'Ajuste manual de estoque' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [ready, setReady] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsTotalPages, setMovementsTotalPages] = useState(1);
  const [movementsTotal, setMovementsTotal] = useState(0);

  const MOVEMENTS_PAGE_SIZE = 20;

  async function load() {
    const [b, m] = await Promise.all([
      api<Balance[]>(`/stock/balances?storeId=${storeId}`, {}, getToken()),
      api<PaginatedResponse<Movement>>(
        `/stock/movements?storeId=${storeId}&page=${movementsPage}&pageSize=${MOVEMENTS_PAGE_SIZE}`,
        {},
        getToken(),
      ),
    ]);
    setBalances(b);
    setMovements(m.data);
    setMovementsTotalPages(m.totalPages);
    setMovementsTotal(m.total);
    if (!adjustForm.productId && b[0]) {
      setAdjustForm((f) => ({ ...f, productId: b[0].product.id }));
    }
  }

  useEffect(() => {
    load().finally(() => setReady(true));
  }, [storeId, movementsPage]);

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
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao ajustar estoque');
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
    <PageHeader title="Estoque" subtitle="Saldos e movimentações da unidade" />

      <Card className="mb-8">
        <h2 className="mb-4 font-semibold">Ajustar estoque</h2>
        {formError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        )}
        {formSuccess && (
          <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{formSuccess}</p>
        )}
        <form onSubmit={handleAdjust} className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Produto</Label>
            <Select
              value={adjustForm.productId}
              onChange={(e) => setAdjustForm({ ...adjustForm, productId: e.target.value })}
            >
              {balances.map((b) => (
                <option key={b.product.id} value={b.product.id}>{b.product.name}</option>
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

      <h2 className="mb-3 font-semibold">Saldos atuais</h2>
      <Table>
        <thead className="bg-slate-50 text-left">
          <tr><th className="p-3">Produto</th><th className="p-3">Disponível</th><th className="p-3">Trânsito</th><th className="p-3">Comodato</th></tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.id} className="border-t border-slate-100">
              <td className="p-3">{b.product.name}</td>
              <td className="p-3">{b.available}</td>
              <td className="p-3">{b.inTransit}</td>
              <td className="p-3">{b.lent}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <h2 className="mb-3 mt-8 font-semibold">Movimentações recentes</h2>
      <Table>
        <thead className="bg-slate-50 text-left">
          <tr><th className="p-3">Data</th><th className="p-3">Produto</th><th className="p-3">Tipo</th><th className="p-3">Qtd</th><th className="p-3">Motivo</th></tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-t border-slate-100">
              <td className="p-3">{formatDate(m.createdAt)}</td>
              <td className="p-3">{m.product.name}</td>
              <td className="p-3">{m.type}</td>
              <td className="p-3">{m.quantity}</td>
              <td className="p-3">{m.reason}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination
        className="mt-4"
        page={movementsPage}
        totalPages={movementsTotalPages}
        total={movementsTotal}
        onPageChange={setMovementsPage}
      />
    </>
  );
}
