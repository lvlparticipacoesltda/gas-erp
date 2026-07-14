export function parsePrice(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatSaleAddress(parts: {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  landmark?: string | null;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryComplement?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryLandmark?: string | null;
}): string {
  const line = [
    parts.street ?? parts.deliveryStreet,
    parts.number ?? parts.deliveryNumber,
  ].filter(Boolean).join(', ');
  const complement = parts.complement ?? parts.deliveryComplement;
  const area = [
    parts.neighborhood ?? parts.deliveryNeighborhood,
    parts.city ?? parts.deliveryCity,
    parts.state ?? parts.deliveryState,
  ].filter(Boolean).join(' - ');
  const extra = (parts.landmark ?? parts.deliveryLandmark) ? ` (${parts.landmark ?? parts.deliveryLandmark})` : '';
  return [[line, complement].filter(Boolean).join(' — '), area].filter(Boolean).join(' — ') + extra;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `Há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Há ${days}d`;
}
