import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

/**
 * Percentual em pt-BR, com duas casas decimais.
 *
 * Duas casas é a precisão que a API já entrega (`computeMarginPercent` arredonda para
 * duas), então a tela mostra o número apurado sem arredondar de novo. As casas são
 * fixas de propósito: `10%` e `10,5%` numa mesma coluna desalinham a leitura, `10,00%`
 * e `10,50%` não.
 *
 * `null`/`undefined` viram travessão: a API devolve `null` quando não houve
 * faturamento no período, e 0% ali afirmaria algo que não foi apurado.
 */
export function formatPercent(value: number | null | undefined) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}

export function formatDateTime(value: string | Date) {
  const date = new Date(value);
  const dateLabel = new Intl.DateTimeFormat('pt-BR').format(date);
  const timeLabel = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${dateLabel} ${timeLabel}`;
}

/**
 * Formata um CNPJ (com ou sem máscara) como 00.000.000/0000-00.
 * Aplica máscara progressiva, servindo tanto para exibição quanto para inputs.
 */
export function formatCnpj(value?: string | null): string {
  if (!value) return '';
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length > 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
}
