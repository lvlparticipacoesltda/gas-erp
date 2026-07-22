'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Select } from '@/components/ui';
import { BrandLoader } from '@/components/brand-loader';
import { api, getToken } from '@/lib/api';
import { formatSaleAddress, timeAgo } from '@/lib/sale-utils';
import {
  formatWaitTime,
  getDeliveryDisplayStatus,
  getElapsedWaitingSeconds,
} from '@gas-erp/shared';

interface DelivererOption {
  id: string;
  user: { name: string };
  status?: string;
}

interface DeliveryRow {
  id: string;
  status: string;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  deliveryAddress?: string | null;
  waitTimeSeconds?: number | null;
  routeDurationSeconds?: number | null;
  elapsedWaitingSeconds?: number;
  elapsedRouteSeconds?: number | null;
  delivererId?: string | null;
  sale: {
    id: string;
    status: string;
    createdAt: string;
    deliveryStreet?: string | null;
    deliveryNumber?: string | null;
    deliveryNeighborhood?: string | null;
    deliveryCity?: string | null;
    deliveryState?: string | null;
    deliveryLandmark?: string | null;
    customer?: { name: string; phone?: string | null } | null;
    items: { quantity: number; product: { name: string } }[];
  };
  deliverer?: { user: { name: string } } | null;
}

interface DeliveriesSidebarProps {
  storeId: string;
  className?: string;
}

function sidebarStorageKey(storeId: string) {
  return `gas-erp:deliveries-sidebar:${storeId}`;
}

function readSidebarCollapsed(storeId: string): boolean {
  if (typeof window === 'undefined') return true;
  const stored = sessionStorage.getItem(sidebarStorageKey(storeId));
  if (stored === 'open') return false;
  if (stored === 'closed') return true;
  return true;
}

function persistSidebarCollapsed(storeId: string, collapsed: boolean) {
  sessionStorage.setItem(sidebarStorageKey(storeId), collapsed ? 'closed' : 'open');
}

export function DeliveriesSidebar({ storeId, className }: DeliveriesSidebarProps) {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [deliverers, setDeliverers] = useState<DelivererOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed(storeId));
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed(storeId));
  }, [storeId]);

  const load = useCallback(async () => {
    try {
      const data = await api<DeliveryRow[]>(`/deliveries?storeId=${storeId}`, {}, getToken());
      setDeliveries(data);
    } catch {
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!storeId) return;
    api<DelivererOption[]>(`/deliverers?storeId=${storeId}`, {}, getToken())
      .then(setDeliverers)
      .catch(() => setDeliverers([]));
  }, [storeId]);

  async function updateDelivery(id: string, status: 'DELIVERED') {
    setActionId(id);
    try {
      await api(`/deliveries/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }, getToken());
      await load();
    } finally {
      setActionId(null);
    }
  }

  async function assignDeliverer(id: string, delivererId: string) {
    if (!delivererId) return;
    setActionId(id);
    try {
      await api(`/deliveries/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ delivererId }),
      }, getToken());
      await load();
    } finally {
      setActionId(null);
    }
  }

  async function cancelSale(saleId: string, deliveryId: string) {
    const reason = window.prompt('Motivo do cancelamento:');
    if (reason == null) return;
    if (!reason.trim()) {
      window.alert('Informe o motivo do cancelamento.');
      return;
    }
    setActionId(deliveryId);
    try {
      await api(`/sales/${saleId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED', canceledReason: reason.trim() }),
      }, getToken());
      await load();
    } finally {
      setActionId(null);
    }
  }

  const waiting = deliveries.filter((d) => d.status === 'PENDING' && !d.delivererId && !d.deliverer);
  const pending = deliveries.filter((d) => d.status === 'PENDING' && (d.delivererId || d.deliverer));
  const inProgress = deliveries.filter((d) => d.status === 'IN_PROGRESS');

  function expand() {
    setCollapsed(false);
    persistSidebarCollapsed(storeId, false);
  }

  function collapse() {
    setCollapsed(true);
    persistSidebarCollapsed(storeId, true);
  }

  if (collapsed) {
    return (
      <>
        <button
          type="button"
          onClick={expand}
          className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-orange-600 lg:hidden"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
            {deliveries.length}
          </span>
          Entregas
        </button>
        <aside
          className={`hidden shrink-0 flex-col border-l border-slate-200 bg-slate-50 lg:flex lg:w-11 ${className ?? ''}`}
        >
          <button
            type="button"
            onClick={expand}
            title="Abrir painel de entregas"
            className="flex h-full min-h-[12rem] flex-col items-center gap-2 border-0 bg-transparent px-1 py-4 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <span className="text-base" aria-hidden>
              📦
            </span>
            <span className="text-[10px] font-bold tabular-nums text-orange-600">{deliveries.length}</span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wide [writing-mode:vertical-rl] rotate-180"
            >
              Entregas
            </span>
          </button>
        </aside>
      </>
    );
  }

  return (
    <aside
      className={`flex w-full shrink-0 flex-col border-l border-slate-200 bg-slate-50 lg:w-64 ${className ?? ''}`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-sm text-orange-600">
            📦
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {deliveries.length} Entregas
            </div>
            <div className="text-[11px] text-slate-500">Em andamento</div>
          </div>
        </div>
        <button
          type="button"
          onClick={collapse}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Recolher entregas"
          title="Recolher"
        >
          ›
        </button>
      </div>

      <div className="max-h-[calc(100vh-7rem)] flex-1 space-y-3 overflow-y-auto p-2.5">
        {loading && (
          <div className="flex justify-center py-8">
            <BrandLoader size="sm" showLabel={false} label="Carregando entregas" />
          </div>
        )}

        {!loading && deliveries.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
            Nenhuma entrega em andamento.
          </p>
        )}

        {waiting.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white">
                {waiting.length}
              </span>
              Em espera
            </h3>
            <div className="space-y-2">
              {waiting.map((d) => (
                <WaitingDeliveryCard
                  key={d.id}
                  delivery={d}
                  deliverers={deliverers}
                  busy={actionId === d.id}
                  onAssign={(delivererId) => assignDeliverer(d.id, delivererId)}
                  onCancel={() => cancelSale(d.sale.id, d.id)}
                />
              ))}
            </div>
          </section>
        )}

        {pending.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-orange-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white">
                {pending.length}
              </span>
              Avisar entregador
            </h3>
            <div className="space-y-2">
              {pending.map((d) => (
                <DeliveryCard key={d.id} delivery={d} busy={actionId === d.id} />
              ))}
            </div>
          </section>
        )}

        {inProgress.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                {inProgress.length}
              </span>
              Confirmar entregas
            </h3>
            <div className="space-y-2">
              {inProgress.map((d) => (
                <DeliveryCard
                  key={d.id}
                  delivery={d}
                  busy={actionId === d.id}
                  onAction={() => updateDelivery(d.id, 'DELIVERED')}
                  actionLabel="Confirmar entrega"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function WaitingDeliveryCard({
  delivery,
  deliverers,
  busy,
  onAssign,
  onCancel,
}: {
  delivery: DeliveryRow;
  deliverers: DelivererOption[];
  busy: boolean;
  onAssign: (delivererId: string) => void;
  onCancel: () => void;
}) {
  const { sale } = delivery;
  const products = sale.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
  const address = delivery.deliveryAddress ?? formatSaleAddress(sale);
  const [selectedDelivererId, setSelectedDelivererId] = useState('');
  const waitLabel = `Aguardando há ${formatWaitTime(
    delivery.elapsedWaitingSeconds ?? getElapsedWaitingSeconds(delivery.sale.createdAt),
  )}`;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <Badge tone="warning">Em espera</Badge>
        <span className="text-xs text-red-500">{timeAgo(delivery.createdAt)}</span>
      </div>
      <p className="font-medium text-slate-900">{sale.customer?.name ?? 'Cliente não identificado'}</p>
      {address && <p className="mt-1 text-xs leading-relaxed text-slate-600">{address}</p>}
      {sale.customer?.phone && (
        <p className="mt-1 text-xs text-slate-500">{sale.customer.phone}</p>
      )}
      <p className="mt-2 text-xs text-slate-500">{products}</p>
      <p className="mt-2 text-xs font-medium text-amber-700">⏱ {waitLabel}</p>

      <div className="mt-3 space-y-2">
        <Select
          value={selectedDelivererId}
          disabled={busy}
          onChange={(e) => setSelectedDelivererId(e.target.value)}
        >
          <option value="">Selecionar entregador…</option>
          {deliverers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.user.name}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          className="w-full !py-1.5 text-xs"
          disabled={busy || !selectedDelivererId}
          onClick={() => onAssign(selectedDelivererId)}
        >
          {busy ? 'Salvando...' : 'Alocar entregador'}
        </Button>
        <Button
          type="button"
          variant="danger"
          className="w-full !py-1.5 text-xs"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar pedido
        </Button>
      </div>
    </div>
  );
}

function DeliveryCard({
  delivery,
  busy,
  onAction,
  actionLabel,
}: {
  delivery: DeliveryRow;
  busy: boolean;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const { sale } = delivery;
  const products = sale.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
  const address = delivery.deliveryAddress ?? formatSaleAddress(sale);
  const display = getDeliveryDisplayStatus(delivery);
  const waitLabel = getWaitLabel(delivery);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <Badge tone={display.tone === 'success' ? 'success' : display.tone === 'danger' ? 'danger' : 'warning'}>
          {display.label}
        </Badge>
        <span className="text-xs text-red-500">{timeAgo(delivery.createdAt)}</span>
      </div>
      <p className="font-medium text-slate-900">{sale.customer?.name ?? 'Cliente não identificado'}</p>
      {address && <p className="mt-1 text-xs text-slate-600 leading-relaxed">{address}</p>}
      {sale.customer?.phone && (
        <p className="mt-1 text-xs text-slate-500">{sale.customer.phone}</p>
      )}
      <p className="mt-2 text-xs text-slate-500">{products}</p>
      <p className="mt-2 text-xs font-medium text-brand-dark">
        🛵 {delivery.deliverer?.user.name ?? 'Sem entregador'}
      </p>
      {waitLabel && <p className="mt-2 text-xs font-medium text-amber-700">⏱ {waitLabel}</p>}
      {onAction && actionLabel && (
        <Button
          type="button"
          className="mt-3 w-full !py-1.5 text-xs"
          variant={display.key === 'IN_PROGRESS' ? 'primary' : 'secondary'}
          disabled={busy}
          onClick={onAction}
        >
          {busy ? 'Salvando...' : actionLabel}
        </Button>
      )}
    </div>
  );
}

function getWaitLabel(delivery: DeliveryRow): string | null {
  if (delivery.status === 'PENDING') {
    const seconds = delivery.elapsedWaitingSeconds ?? getElapsedWaitingSeconds(delivery.sale.createdAt);
    return `Aguardando há ${formatWaitTime(seconds)}`;
  }
  if (delivery.status === 'IN_PROGRESS' && delivery.startedAt) {
    const routeSeconds =
      delivery.elapsedRouteSeconds ?? getElapsedWaitingSeconds(delivery.startedAt);
    const waitPart =
      delivery.waitTimeSeconds != null
        ? `Esperou ${formatWaitTime(delivery.waitTimeSeconds)} · `
        : '';
    return `${waitPart}Em rota há ${formatWaitTime(routeSeconds)}`;
  }
  return null;
}
