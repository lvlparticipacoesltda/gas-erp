'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatDate } from '@/lib/utils';

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
  product: { name: string; sku: string };
}

export default function StockPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  useEffect(() => {
    Promise.all([
      api<Balance[]>(`/stock/balances?storeId=${storeId}`, {}, getToken()),
      api<{ data: Movement[] }>(`/stock/movements?storeId=${storeId}`, {}, getToken()),
    ]).then(([b, m]) => {
      setBalances(b);
      setMovements(m.data);
    });
  }, [storeId]);

  return (
    <AppShell mode="store">
      <PageHeader title="Estoque" subtitle="Saldos e movimentações da unidade" />
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
    </AppShell>
  );
}
