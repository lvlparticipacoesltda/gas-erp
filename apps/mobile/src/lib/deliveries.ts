import { api } from './api';
import type { Delivery, DeliveryStatus, Sale } from '../types';

export function fetchMyDeliveries(): Promise<Delivery[]> {
  return api<Delivery[]>('/deliveries/my');
}

export function updateDeliveryStatus(
  id: string,
  status: Extract<DeliveryStatus, 'IN_PROGRESS' | 'DELIVERED' | 'CANCELLED'>,
): Promise<unknown> {
  return api(`/deliveries/${id}/status`, { method: 'PATCH', body: { status } });
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

export function deliveryAddress(delivery: Delivery): string {
  return delivery.deliveryAddress?.trim() || buildAddress(delivery.sale);
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
