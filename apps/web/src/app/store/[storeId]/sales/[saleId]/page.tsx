'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { SalesWithSidebar } from '@/components/sales-with-sidebar';
import { Badge, Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatSaleAddress } from '@/lib/sale-utils';
import {
  canManageSales,
  getSaleDisplayStatus,
  PAYMENT_METHOD_LABELS,
  SALE_CHANNEL_LABELS,
  SALE_STATUS_LABELS,
  SALE_STATUSES,
  formatWaitTime,
  getElapsedWaitingSeconds,
  getRouteDurationSeconds,
  getWaitTimeSeconds,
} from '@gas-erp/shared';

interface SaleDetail {
  id: string;
  createdAt: string;
  status: string;
  channel: string;
  total: number | string;
  gasDoPovoBenefit?: boolean;
  deliveryFee?: number | string;
  notes?: string | null;
  canceledReason?: string | null;
  canceledAt?: string | null;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  customer?: { name: string; phone?: string | null } | null;
  deliverer?: { id: string; user: { name: string } } | null;
  attendant?: { id: string; name: string; email?: string } | null;
  items: { quantity: number; unitPrice: number | string; product: { name: string } }[];
  payments: { method: string; amount: number | string }[];
  delivery?: { id: string; status: string; startedAt?: string | null; completedAt?: string | null } | null;
  statusLogs: {
    status: string;
    createdAt: string;
    notes?: string | null;
    user?: { id: string; name: string; email?: string } | null;
  }[];
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
    return <PageLoader />;
  }

  const address = formatSaleAddress({
    street: sale.deliveryStreet,
    number: sale.deliveryNumber,
    neighborhood: sale.deliveryNeighborhood,
    city: sale.deliveryCity,
    state: sale.deliveryState,
  });
  const display = getSaleDisplayStatus(sale);
  const currentUser = getStoredUser<{ role: string }>();
  const isManager = currentUser ? canManageSales(currentUser.role) : false;
  const isTerminal = sale.status === 'DELIVERED' || sale.status === 'PORTARIA';
  const canEdit =
    sale.status !== 'CANCELLED' && (!isTerminal || isManager);
  const cancelLog = sale.statusLogs.find((log) => log.status === 'CANCELLED');
  const editableStatuses: string[] =
    isTerminal && isManager
      ? ['CANCELLED']
      : SALE_STATUSES.filter((s) => s !== 'DRAFT' && s !== 'PORTARIA');
  const statusSelectValue = editableStatuses.includes(status) ? status : '';

  return (
    <SalesWithSidebar storeId={storeId}>
        <Link href={`/store/${storeId}/sales`} className="text-sm text-brand hover:underline">
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
              <div className="flex justify-between"><dt className="text-slate-500">Registrado por</dt><dd>{sale.attendant?.name ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Registrado em</dt><dd>{formatDate(sale.createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Entregador</dt><dd>{sale.deliverer?.user.name ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Total</dt><dd className="font-semibold">{formatCurrency(sale.total)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Benefício Gás do Povo</dt>
                <dd>{sale.gasDoPovoBenefit ? 'Sim' : 'Não'}</dd>
              </div>
              {Number(sale.deliveryFee ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Taxa entrega</dt>
                  <dd>{formatCurrency(sale.deliveryFee ?? 0)}</dd>
                </div>
              )}
              {sale.delivery?.startedAt && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Espera até a rota</dt>
                    <dd>{formatWaitTime(getWaitTimeSeconds(sale.createdAt, sale.delivery.startedAt))}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Tempo em rota</dt>
                    <dd>
                      {formatWaitTime(
                        getRouteDurationSeconds(sale.delivery.startedAt, sale.delivery.completedAt)
                          ?? (sale.delivery.status === 'IN_PROGRESS'
                            ? getElapsedWaitingSeconds(sale.delivery.startedAt)
                            : null),
                      )}
                    </dd>
                  </div>
                </>
              )}
              {address && <div><dt className="text-slate-500">Endereço</dt><dd className="mt-1">{address}</dd></div>}
              {sale.notes && <div><dt className="text-slate-500">Obs.</dt><dd className="mt-1">{sale.notes}</dd></div>}
              {sale.status === 'CANCELLED' && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="font-medium text-red-800">Cancelamento</p>
                  {sale.canceledAt && (
                    <p className="mt-1 text-red-700">Em {formatDate(sale.canceledAt)}</p>
                  )}
                  {cancelLog?.user && (
                    <p className="mt-1 text-red-700">Por {cancelLog.user.name}</p>
                  )}
                  {(sale.canceledReason || cancelLog?.notes) && (
                    <p className="mt-1 text-red-700">
                      Motivo: {sale.canceledReason || cancelLog?.notes}
                    </p>
                  )}
                </div>
              )}
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
              <p className="text-sm text-slate-500">
                {sale.status === 'CANCELLED'
                  ? 'Venda cancelada — histórico preservado para auditoria.'
                  : 'Esta venda não pode ser alterada pelo seu perfil.'}
              </p>
            ) : (
              <div className="space-y-4">
                {isTerminal && isManager && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Como gerente/master, você pode cancelar esta venda finalizada. O cancelamento ficará registrado com seu usuário e motivo.
                  </p>
                )}
                <div>
                  <Label>Novo status</Label>
                  <Select value={statusSelectValue} onChange={(e) => setStatus(e.target.value)}>
                    {editableStatuses.map((s) => (
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
                    <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} required />
                  </div>
                )}

                <Button
                  type="button"
                  disabled={saving || !statusSelectValue || statusSelectValue === sale.status}
                  onClick={saveStatus}
                >
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </div>
            )}

            <h3 className="mb-2 mt-8 font-medium">Histórico de status</h3>
            <ul className="space-y-3 text-sm">
              {sale.statusLogs.map((log) => (
                <li key={`${log.status}-${log.createdAt}`} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {SALE_STATUS_LABELS[log.status] ?? log.status}
                    </span>
                    <span className="text-slate-500">{formatDate(log.createdAt)}</span>
                  </div>
                  {log.user && (
                    <p className="mt-1 text-slate-600">Por {log.user.name}</p>
                  )}
                  {log.notes && (
                    <p className="mt-1 text-slate-600">Obs.: {log.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </SalesWithSidebar>
  );
}
