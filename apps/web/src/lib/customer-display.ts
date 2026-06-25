/** Iniciais para avatar (ex.: Maria Silva → MS). */
export function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Formata telefone BR quando possível. */
export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export interface CustomerAddress {
  street: string;
  number?: string;
  neighborhood?: string;
  city: string;
  state: string;
}

export function formatAddressShort(addr?: CustomerAddress): string {
  if (!addr) return 'Sem endereço cadastrado';
  const street = [addr.street, addr.number].filter(Boolean).join(', ');
  const parts = [street, addr.neighborhood, [addr.city, addr.state].filter(Boolean).join(' - ')].filter(
    Boolean,
  );
  return parts.join(' · ') || 'Sem endereço cadastrado';
}
