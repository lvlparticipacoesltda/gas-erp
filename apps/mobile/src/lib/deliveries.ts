import { api } from './api';
import type { Delivery, DeliveryStatus, Sale, TrackingPoint } from '../types';

export function fetchMyDeliveries(): Promise<Delivery[]> {
  return api<Delivery[]>('/deliveries/my');
}

export function fetchDeliveryTracking(deliveryId: string): Promise<TrackingPoint[]> {
  return api<TrackingPoint[]>(`/deliveries/${deliveryId}/tracking`);
}

export function updateDeliveryStatus(
  id: string,
  status: Extract<DeliveryStatus, 'IN_PROGRESS' | 'DELIVERED' | 'CANCELLED'>,
): Promise<unknown> {
  return api(`/deliveries/${id}/status`, { method: 'PATCH', body: { status } });
}

export function updateSalePayments(
  saleId: string,
  payments: { storePaymentMethodId: string; amount: number }[],
  options?: {
    unitPrice?: number;
    itemUnitPrices?: { id: string; unitPrice: number }[];
    itemPayments?: { id: string; storePaymentMethodId: string }[];
    deliveryFeeStorePaymentMethodId?: string | null;
  },
): Promise<unknown> {
  const { unitPrice, itemUnitPrices, itemPayments, deliveryFeeStorePaymentMethodId } = options ?? {};
  return api(`/sales/${saleId}/payments`, {
    method: 'PATCH',
    body: {
      ...(payments.length ? { payments } : {}),
      ...(itemPayments?.length ? { itemPayments } : {}),
      ...(unitPrice !== undefined ? { unitPrice } : {}),
      ...(itemUnitPrices?.length ? { itemUnitPrices } : {}),
      ...(deliveryFeeStorePaymentMethodId !== undefined
        ? { deliveryFeeStorePaymentMethodId }
        : {}),
    },
  });
}

/** Monta o endereço de entrega a partir dos campos da venda (fallback do backend). */
export function buildAddress(sale: Sale): string {
  const parts: string[] = [];
  const street = [sale.deliveryStreet, sale.deliveryNumber].filter(Boolean).join(', ');
  if (street) parts.push(street);
  if (sale.deliveryComplement) parts.push(sale.deliveryComplement);
  if (sale.deliveryNeighborhood) parts.push(sale.deliveryNeighborhood);
  const city = [sale.deliveryCity, sale.deliveryState].filter(Boolean).join(' - ');
  if (city) parts.push(city);
  if (sale.deliveryLandmark) parts.push(`Ref.: ${sale.deliveryLandmark}`);
  return parts.join(', ');
}

/**
 * Endereço para abrir Maps/Waze — prioriza campos estruturados da venda
 * (evita texto genérico/errôneo e faz o Google resolver o número correto).
 */
export function buildNavigationAddress(sale: Sale): string | null {
  const street = sale.deliveryStreet?.trim();
  const number = sale.deliveryNumber?.trim();
  const city = sale.deliveryCity?.trim();
  const state = sale.deliveryState?.trim();
  if (!street || !city) {
    const fallback = buildAddress(sale).trim();
    return fallback || null;
  }

  const parts: string[] = [];
  parts.push(number ? `${street}, ${number}` : street);
  if (sale.deliveryNeighborhood?.trim()) parts.push(sale.deliveryNeighborhood.trim());
  parts.push(state ? `${city} - ${state}` : city);
  parts.push('Brasil');
  return parts.join(', ');
}

export function deliveryAddress(delivery: Delivery): string {
  return delivery.deliveryAddress?.trim() || buildAddress(delivery.sale);
}

/** Endereço curto para pills e badges no mapa (rua + bairro/cidade). */
export function shortDeliveryAddress(delivery: Delivery): string {
  const sale = delivery.sale;
  const street = [sale.deliveryStreet, sale.deliveryNumber].filter(Boolean).join(', ');
  const neighborhood = sale.deliveryNeighborhood?.trim();
  const city = sale.deliveryCity?.trim();

  if (street && neighborhood) return `${street} · ${neighborhood}`;
  if (street && city) return `${street} · ${city}`;
  if (street) return street;

  const full = deliveryAddress(delivery);
  if (!full) return 'Endereço não informado';
  return full.length > 52 ? `${full.slice(0, 49)}…` : full;
}

/** Verdadeiro quando a entrega ocorreu no dia corrente (para o histórico). */
export function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export type HistoryPeriod = 'today' | '7d' | '30d' | 'all';

/** Data de referência para filtro de histórico (conclusão ou criação). */
export function historyReferenceDate(delivery: Delivery): string {
  return delivery.completedAt ?? delivery.startedAt ?? delivery.createdAt;
}

/** Filtra entregas finalizadas (entregue ou cancelada) por período. */
export function filterHistoryByPeriod(
  deliveries: Delivery[],
  period: HistoryPeriod,
): Delivery[] {
  if (period === 'all') return deliveries;

  const now = new Date();
  const cutoff = new Date(now);
  if (period === 'today') {
    cutoff.setHours(0, 0, 0, 0);
  } else {
    const days = period === '7d' ? 7 : 30;
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
  }

  return deliveries.filter((d) => {
    const ref = historyReferenceDate(d);
    if (period === 'today') return isToday(ref);
    return new Date(ref) >= cutoff;
  });
}
