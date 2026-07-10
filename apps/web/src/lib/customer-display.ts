import { formatPhoneBr, stripPhoneDigits } from '@gas-erp/shared';

/** Iniciais para avatar (ex.: Maria Silva → MS). */
export function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Formata telefone BR quando possível. */
export function formatPhoneDisplay(phone?: string): string {
  return formatPhoneBr(phone);
}

export function phoneQueryMatches(phone: string | undefined, query: string): boolean {
  if (!phone) return false;
  const qDigits = stripPhoneDigits(query);
  if (qDigits.length >= 2) {
    return stripPhoneDigits(phone).includes(qDigits);
  }
  return phone.toLowerCase().includes(query.trim().toLowerCase());
}

export interface CustomerAddress {
  street: string;
  number?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode?: string;
}

export function formatAddressShort(addr?: CustomerAddress): string {
  if (!addr) return 'Sem endereço cadastrado';
  const street = [addr.street, addr.number].filter(Boolean).join(', ');
  const parts = [street, addr.neighborhood, [addr.city, addr.state].filter(Boolean).join(' - ')].filter(
    Boolean,
  );
  return parts.join(' · ') || 'Sem endereço cadastrado';
}
