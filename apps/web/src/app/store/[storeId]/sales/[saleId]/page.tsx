'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { SalesWithSidebar } from '@/components/sales-with-sidebar';
import { Badge, Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatSaleAddress } from '@/lib/sale-utils';
import {
  getSaleDisplayStatus,
  PAYMENT_METHOD_LABELS,
  SALE_CHANNEL_LABELS,
  SALE_STATUS_LABELS,
  SALE_STATUSES,
} from '@gas-erp/shared';

interface SaleDetail {
  id: string;
  createdAt: string;
  status: string;
  channel: string;
  total: number | string;
  notes?: string | null;
  canceledReason?: string | null;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  customer?: { name: string; phone?: string | null } | null;
  deliverer?: { id: string; user: { name: string } } | null;
  attendant?: { name: string } | null;
  items: { quantity: number; unitPrice: number | string; product: { name: string } }[];
  payments: { method: string; amount: number | string }[];
  delivery?: { id: string; status: string } | null;
  statusLogs: { status: string; createdAt: string }[];
}

interface Deliverer { id: string; user: { name: string } }

export default function SaleDetailPage() {
  const { storeId, saleId } = useParams<{ storeId: string; saleId: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [status, setStatus] = useState('');
  const [delivererId, setDelivererId] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const [s, d] = await Promise.all([
      api<SaleDetail>(`/sales/${saleId}`, {}, getToken()),
      api<Deliverer[]>(`/deliverers?storeId=${storeId}`, {}, getToken()),
    ]);
    setSale(s);
    setStatus(s.status);
    setDelivererId(s.deliverer?.id ?? '');
    setDeliverers(d);
  }

  useEffect(() => {
    load();
  }, [saleId, storeId]);

  async function saveStatus() {
    if (!sale) return;
    setError('');
    setSaving(true);
    try {
      await api(`/sales/${saleId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          delivererId: status === 'IN_DELIVERY' && delivererId ? delivererId : undefined,
          canceledReason: status === 'CANCELLED' ? cancelReason : undefined,
        }),
      }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar venda');
    } finally {
      setSaving(false);
    }
  }

  if (!sale) {
    return (
      <AppShell mode="store">
        <SalesWithSidebar storeId={storeId}>
          <p className="text-slate-500">Carregando...</p>
        </SalesWithSidebar>
      </AppShell>
    );
  }

  const address = formatSaleAddress({
    street: sale.deliveryStreet,
    number: sale.deliveryNumber,
    neighborhood: sale.deliveryNeighborhood,
    city: sale.deliveryCity,
    state: sale.deliveryState,
  });
  const display = getSaleDisplayStatus(sale);
  const canEdit = sale.status !== 'CANCELLED';

  return (
    <AppShell mode="store">
      <SalesWithSidebar storeId={storeId}>
        <Link href={`/store/${storeId}/sales`} className="text-sm text-sky-600 hover:underline">
          ← Voltar ao histórico
        </Link>

        <PageHeader
          title={`Venda ${formatDate(sale.createdAt)}`}
          subtitle={sale.customer?.name ?? 'Cliente não identificado'}
        />

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 font-semibold">Detalhes</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><Badge tone={display.tone}>{display.label}</Badge></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Canal</dt><dd>{SALE_CHANNEL_LABELS[sale.channel] ?? sale.channel}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Atendente</dt><dd>{sale.attendant?.name ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Entregador</dt><dd>{sale.deliverer?.user.name ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Total</dt><dd className="font-semibold">{formatCurrency(sale.total)}</dd></div>
              {address && <div><dt className="text-slate-500">Endereço</dt><dd className="mt-1">{address}</dd></div>}
              {sale.notes && <div><dt className="text-slate-500">Obs.</dt><dd className="mt-1">{sale.notes}</dd></div>}
            </dl>

            <h3 className="mb-2 mt-6 font-medium">Itens</h3>
            <ul className="space-y-1 text-sm">
              {sale.items.map((item, i) => (
                <li key={i}>{item.quantity}x {item.product.name} — {formatCurrency(item.unitPrice)}</li>
              ))}
            </ul>

            <h3 className="mb-2 mt-4 font-medium">Pagamentos</h3>
            <ul className="space-y-1 text-sm">
              {sale.payments.map((p, i) => (
                <li key={i}>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}: {formatCurrency(p.amount)}</li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">Alterar status</h2>
            {!canEdit ? (
              <p className="text-sm text-slate-500">Esta venda não pode mais ser alterada.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Novo status</Label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {SALE_STATUSES.filter((s) => s !== 'DRAFT').map((s) => (
                      <option key={s} value={s}>{SALE_STATUS_LABELS[s]}</option>
                    ))}
                  </Select>
                </div>

                {status === 'IN_DELIVERY' && (
                  <div>
                    <Label>Entregador</Label>
                    <Select value={delivererId} onChange={(e) => setDelivererId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {deliverers.map((d) => (
                        <option key={d.id} value={d.id}>{d.user.name}</option>
                      ))}
                    </Select>
                  </div>
                )}

                {status === 'CANCELLED' && (
                  <div>
                    <Label>Motivo do cancelamento</Label>
                    <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                  </div>
                )}

                <Button type="button" disabled={saving || status === sale.status} onClick={saveStatus}>
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </div>
            )}

            <h3 className="mb-2 mt-8 font-medium">Histórico de status</h3>
            <ul className="space-y-2 text-sm">
              {sale.statusLogs.map((log, i) => (
                <li key={i} className="flex justify-between text-slate-600">
                  <span>{SALE_STATUS_LABELS[log.status] ?? log.status}</span>
                  <span>{formatDate(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </SalesWithSidebar>
    </AppShell>
  );
}
