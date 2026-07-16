/**
 * Input monetário BR: mantém vírgula/ponto durante a digitação
 * e só converte para number na hora de calcular/enviar.
 */

/** Permite dígitos e no máximo um separador decimal (, ou .), com até 2 casas. */
export function sanitizeMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return '';

  const firstSep = cleaned.search(/[.,]/);
  if (firstSep < 0) return cleaned;

  const sep = cleaned[firstSep];
  const intPart = cleaned.slice(0, firstSep).replace(/[.,]/g, '');
  const fracPart = cleaned
    .slice(firstSep + 1)
    .replace(/[.,]/g, '')
    .slice(0, 2);
  return fracPart.length > 0 || cleaned.endsWith(sep)
    ? `${intPart}${sep}${fracPart}`
    : intPart;
}

export function parseMoneyInput(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Exibe number no draft com vírgula (pt-BR). */
export function formatMoneyDraft(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return String(value).replace('.', ',');
}
