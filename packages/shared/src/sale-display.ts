import { BACKDATE_APPROVAL_LABELS } from './sale-backdate';
import { MOBILE_APPROVAL_LABELS } from './sale-mobile';
import { DELIVERY_STATUS_LABELS, SALE_STATUS_LABELS } from './enums';

export type SaleDisplayTone = 'default' | 'success' | 'warning' | 'danger';

export interface SaleDisplayStatus {
  key: string;
  label: string;
  tone: SaleDisplayTone;
}

export function isMobileOriginatedSale(sale: {
  channel?: string;
  createdByDelivererId?: string | null;
  createdByDeliverer?: unknown | null;
  mobileApproval?: string;
}): boolean {
  return (
    sale.channel === 'APP' ||
    sale.mobileApproval === 'PENDING' ||
    sale.mobileApproval === 'APPROVED' ||
    sale.mobileApproval === 'REJECTED' ||
    Boolean(sale.createdByDelivererId ?? sale.createdByDeliverer)
  );
}

export function getSaleAttendantName(sale: {
  attendant?: { name: string } | null;
  createdByDeliverer?: { user: { name: string } } | null;
  channel?: string;
  mobileApproval?: string;
  createdByDelivererId?: string | null;
}): string | null {
  if (isMobileOriginatedSale(sale)) {
    return sale.createdByDeliverer?.user.name ?? null;
  }
  return sale.attendant?.name ?? null;
}

/** Status unificado para venda + entrega (histórico e sidebar). */
export function getSaleDisplayStatus(sale: {
  status: string;
  backdateApproval?: string;
  mobileApproval?: string;
  delivery?: { status: string } | null;
}): SaleDisplayStatus {
  if (sale.mobileApproval === 'PENDING') {
    return {
      key: 'MOBILE_PENDING',
      label: MOBILE_APPROVAL_LABELS.PENDING,
      tone: 'warning',
    };
  }

  if (sale.backdateApproval === 'PENDING') {
    return {
      key: 'BACKDATE_PENDING',
      label: BACKDATE_APPROVAL_LABELS.PENDING,
      tone: 'warning',
    };
  }

  if (sale.mobileApproval === 'REJECTED') {
    return { key: 'MOBILE_REJECTED', label: MOBILE_APPROVAL_LABELS.REJECTED, tone: 'danger' };
  }

  if (sale.backdateApproval === 'REJECTED') {
    return {
      key: 'BACKDATE_REJECTED',
      label: BACKDATE_APPROVAL_LABELS.REJECTED,
      tone: 'danger',
    };
  }

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

/** Badge do card/popup no mapa de entregadores. */
export function getDelivererPositionBadge(position: {
  delivererStatus: string;
  deliveryStatus?: string | null;
  stale: boolean;
  isLive?: boolean;
  latitude: number | null;
  longitude: number | null;
}): SaleDisplayStatus {
  if (position.latitude === null && position.longitude === null) {
    return { key: 'NO_GPS', label: 'Sem GPS', tone: 'default' };
  }
  if (position.stale) {
    return { key: 'STALE', label: 'Desatualizado', tone: 'default' };
  }
  if (position.deliveryStatus === 'IN_PROGRESS') {
    return {
      key: 'IN_PROGRESS',
      label: DELIVERY_STATUS_LABELS.IN_PROGRESS,
      tone: position.isLive ? 'warning' : 'default',
    };
  }
  if (position.isLive) {
    return { key: 'LIVE', label: 'Rastreando', tone: 'success' };
  }
  return { key: 'LAST_KNOWN', label: 'Última posição', tone: 'default' };
}

export { DELIVERY_STATUS_LABELS };
