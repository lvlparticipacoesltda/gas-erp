import { DELIVERY_STATUS_LABELS, SALE_STATUS_LABELS } from './enums';

export type SaleDisplayTone = 'default' | 'success' | 'warning' | 'danger';

export interface SaleDisplayStatus {
  key: string;
  label: string;
  tone: SaleDisplayTone;
}

/** Status unificado para venda + entrega (histórico e sidebar). */
export function getSaleDisplayStatus(sale: {
  status: string;
  delivery?: { status: string } | null;
}): SaleDisplayStatus {
  if (sale.status === 'CANCELLED') {
    return { key: 'CANCELLED', label: 'Cancelada', tone: 'danger' };
  }

  if (sale.status === 'PORTARIA') {
    return { key: 'PORTARIA', label: 'Portaria', tone: 'default' };
  }

  if (sale.status === 'DELIVERED' || sale.delivery?.status === 'DELIVERED') {
    return { key: 'DELIVERED', label: 'Entregue', tone: 'success' };
  }

  if (sale.delivery?.status === 'IN_PROGRESS') {
    return { key: 'IN_PROGRESS', label: 'Em rota', tone: 'warning' };
  }

  if (sale.delivery?.status === 'PENDING') {
    return { key: 'PENDING', label: 'Aguardando', tone: 'warning' };
  }

  // Legado: venda marcada IN_DELIVERY antes da correção do fluxo
  if (sale.status === 'IN_DELIVERY') {
    return { key: 'IN_PROGRESS', label: 'Em rota', tone: 'warning' };
  }

  if (sale.status === 'CONFIRMED') {
    return { key: 'CONFIRMED', label: 'Confirmada', tone: 'default' };
  }

  if (sale.status === 'DRAFT') {
    return { key: 'DRAFT', label: SALE_STATUS_LABELS.DRAFT, tone: 'default' };
  }

  return {
    key: sale.status,
    label: SALE_STATUS_LABELS[sale.status] ?? sale.status,
    tone: 'default',
  };
}

/** Rótulo da entrega na sidebar (mesma nomenclatura do histórico). */
export function getDeliveryDisplayStatus(delivery: {
  status: string;
  sale: { status: string };
}): SaleDisplayStatus {
  return getSaleDisplayStatus({ status: delivery.sale.status, delivery: { status: delivery.status } });
}

export { DELIVERY_STATUS_LABELS };
