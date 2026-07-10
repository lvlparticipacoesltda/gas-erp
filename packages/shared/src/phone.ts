/** Remove tudo que não for dígito; descarta código do país 55 quando aplicável. */
export function stripPhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

/** Armazena telefone apenas com dígitos (ou undefined se vazio). */
export function normalizePhoneForStorage(raw?: string | null): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const digits = stripPhoneDigits(trimmed);
  return digits || undefined;
}

/** Exibe telefone BR quando houver 10 ou 11 dígitos. */
export function formatPhoneBr(phone?: string | null): string {
  if (!phone) return '';
  const digits = stripPhoneDigits(phone);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** Termos para busca por telefone (texto digitado + só dígitos). */
export function phoneSearchTerms(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const digits = stripPhoneDigits(trimmed);
  const terms = new Set<string>([trimmed]);
  if (digits.length >= 2) terms.add(digits);
  return [...terms];
}
