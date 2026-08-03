/** BOM UTF-8 — faz o Excel pt-BR abrir o arquivo com acentuação correta. */
const UTF8_BOM = '\uFEFF';

/** Escapa um valor para CSV com separador ";" (padrão Excel pt-BR). */
export function csvCell(value: string | number): string {
  const text = String(value ?? '');
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Gera CSV nativo (sem libs) com BOM UTF-8 e separador ";". */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(';'));
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}

/** Valor monetário com vírgula decimal (sem símbolo), p/ Excel pt-BR. */
export function formatCsvMoney(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** `2026-08-03` → `03/08/2026`. */
export function formatDateKey(dateKey: string): string {
  return dateKey.split('-').reverse().join('/');
}
