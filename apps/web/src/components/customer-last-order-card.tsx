'use client';

import { useEffect, useState } from 'react';
import { Clock, ShoppingBag, Wallet, MapPin, Receipt } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { formatSaleAddress } from '@/lib/sale-utils';
import { PAYMENT_METHOD_LABELS, type PaginatedResponse } from '@gas-erp/shared';

interface LastOrderPayment {
  amount: number | string;
  method: string;
  storePaymentMethod?: { label: string; systemCode?: string | null } | null;
}

interface LastOrderSale {
  id: string;
  createdAt: string;
  total: number | string;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryComplement?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryLandmark?: string | null;
  items: { quantity: number; product: { name: string } }[];
  payments?: LastOrderPayment[] | null;
}

function paymentLabel(payment: LastOrderPayment): string {
  return payment.storePaymentMethod?.label ?? PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
}

function summarizePayments(payments?: LastOrderPayment[] | null): string {
  if (!payments || payments.length === 0) return '';
  const labels = Array.from(new Set(payments.map(paymentLabel)));
  return labels.join(', ');
}

export function CustomerLastOrderCard({
  storeId,
  customerId,
}: {
  storeId: string;
  customerId: string | null;
}) {
  const [sale, setSale] = useState<LastOrderSale | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId) {
      setSale(null);
      setTotal(0);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    api<{ sales: PaginatedResponse<LastOrderSale> }>(
      `/customers/${customerId}?storeId=${storeId}&page=1&pageSize=1`,
      {},
      getToken(),
    )
      .then((res) => {
        if (cancelled) return;
        setSale(res.sales.data[0] ?? null);
        setTotal(res.sales.total);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar histórico');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, customerId]);

  if (!customerId) return null;

  if (loading && !sale) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-400">
        Carregando histórico…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
        Primeiro pedido deste cliente.
      </div>
    );
  }

  const itemsSummary = sale.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
  const address = formatSaleAddress(sale);
  const payments = summarizePayments(sale.payments);
  const orderLabel = total === 1 ? '1 pedido' : `${total} pedidos`;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Receipt className="h-4 w-4 text-brand" />
          Último pedido
        </h3>
        <span className="rounded-full bg-brand-muted px-2.5 py-1 text-xs font-medium text-brand-dark">
          {orderLabel}
        </span>
      </div>

      <dl className="space-y-2 text-sm">
        <LastOrderRow icon={<Clock className="h-4 w-4" />} value={formatDateTime(sale.createdAt)} />
        <LastOrderRow
          icon={<ShoppingBag className="h-4 w-4" />}
          value={itemsSummary || 'Sem itens'}
        />
        <LastOrderRow
          icon={<Wallet className="h-4 w-4" />}
          value={
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold text-slate-900">{formatCurrency(sale.total)}</span>
              {payments && <span className="text-slate-500">· {payments}</span>}
            </span>
          }
        />
        {address && <LastOrderRow icon={<MapPin className="h-4 w-4" />} value={address} />}
      </dl>
    </div>
  );
}

function LastOrderRow({ icon, value }: { icon: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-slate-700">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}
