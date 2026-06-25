'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatSaleAddress, timeAgo } from '@/lib/sale-utils';
import {
  formatWaitTime,
  getDeliveryDisplayStatus,
  getElapsedWaitingSeconds,
} from '@gas-erp/shared';

interface DeliveryRow {
  id: string;
  status: string;
  createdAt: string;
  startedAt?: string | null;
  deliveryAddress?: string | null;
  waitTimeSeconds?: number | null;
  elapsedWaitingSeconds?: number;
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
  deliverer: { user: { name: string } };
}

interface DeliveriesSidebarProps {
  storeId: string;
  className?: string;
}

export function DeliveriesSidebar({ storeId, className }: DeliveriesSidebarProps) {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

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

  const pending = deliveries.filter((d) => d.status === 'PENDING');
  const inProgress = deliveries.filter((d) => d.status === 'IN_PROGRESS');

  if (collapsed) {
    return (
      <aside className={className}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-orange-600 lg:static lg:rounded-xl"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
            {deliveries.length}
          </span>
          Entregas
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`flex w-full shrink-0 flex-col border-l border-slate-200 bg-slate-50 lg:w-80 xl:w-96 ${className ?? ''}`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">📦</span>
          <div>
            <div className="font-semibold text-slate-900">{deliveries.length} Entregas</div>
            <div className="text-xs text-slate-500">Em andamento</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-slate-400 hover:text-slate-600 lg:hidden"
          aria-label="Recolher"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 max-h-[calc(100vh-8rem)]">
        {loading && <p className="text-sm text-slate-500 p-2">Carregando...</p>}

        {!loading && deliveries.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
            Nenhuma entrega em andamento.
          </p>
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
      <p className="mt-2 text-xs font-medium text-brand-dark">🛵 {delivery.deliverer.user.name}</p>
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
    return `Em rota há ${formatWaitTime(getElapsedWaitingSeconds(delivery.startedAt))}`;
  }
  return null;
}
