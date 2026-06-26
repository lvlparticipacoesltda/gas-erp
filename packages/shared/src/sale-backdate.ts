import {
  formatDateKeyInTimezone,
  getBusinessDayBounds,
  isValidDateKey,
  zonedTimeToUtc,
} from './business-day';
import { canManageSales } from './permissions';

export const BACKDATE_APPROVAL_STATUSES = [
  'NOT_REQUIRED',
  'PENDING',
  'APPROVED',
  'REJECTED',
] as const;

export type BackdateApprovalStatus = (typeof BACKDATE_APPROVAL_STATUSES)[number];

export const BACKDATE_APPROVAL_LABELS: Record<BackdateApprovalStatus, string> = {
  NOT_REQUIRED: 'Data atual',
  PENDING: 'Aguardando aprovação (retroativa)',
  APPROVED: 'Aprovada (retroativa)',
  REJECTED: 'Rejeitada (retroativa)',
};

/** Vendas que entram em relatórios e faturamento do dia. */
export const COUNTED_BACKDATE_APPROVALS: BackdateApprovalStatus[] = [
  'NOT_REQUIRED',
  'APPROVED',
];

export function todayBusinessDateKey(): string {
  return formatDateKeyInTimezone(new Date());
}

export function saleInstantFromDateKey(dateKey: string): Date {
  return zonedTimeToUtc(dateKey, 12, 0, 0);
}

export function isPastBusinessDay(dateKey: string): boolean {
  const today = todayBusinessDateKey();
  return dateKey < today;
}

export function isFutureBusinessDay(dateKey: string): boolean {
  const today = todayBusinessDateKey();
  return dateKey > today;
}

export function formatSaleDateLabel(value: string | Date): string {
  const key =
    value instanceof Date
      ? formatDateKeyInTimezone(value)
      : value.slice(0, 10);
  return key.split('-').reverse().join('/');
}

/** Data da venda + hora do registro (listagens). */
export function formatSaleDateTimeLabel(sale: {
  saleDate?: string | Date | null;
  createdAt: string | Date;
}): string {
  const dateLabel = formatSaleDateLabel(sale.saleDate ?? sale.createdAt);
  const created =
    sale.createdAt instanceof Date ? sale.createdAt : new Date(sale.createdAt);
  const timeLabel = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(created);
  return `${dateLabel} ${timeLabel}`;
}

export function resolveSaleBackdateInput(input: {
  saleDate?: string;
  userRole: string;
  backdateRequestNotes?: string;
}): {
  saleDateKey: string;
  saleDate: Date;
  backdateApproval: BackdateApprovalStatus;
  requiresManagerApproval: boolean;
} {
  const saleDateKey = input.saleDate?.trim() || todayBusinessDateKey();

  if (!isValidDateKey(saleDateKey)) {
    throw new Error('Data da venda inválida. Use o formato AAAA-MM-DD.');
  }

  if (isFutureBusinessDay(saleDateKey)) {
    throw new Error('Não é permitido registrar venda com data futura.');
  }

  const isBackdated = isPastBusinessDay(saleDateKey);
  const manager = canManageSales(input.userRole);

  if (isBackdated && !manager && !input.backdateRequestNotes?.trim()) {
    throw new Error('Informe o motivo para registrar a venda com data anterior.');
  }

  let backdateApproval: BackdateApprovalStatus = 'NOT_REQUIRED';
  if (isBackdated) {
    backdateApproval = manager ? 'APPROVED' : 'PENDING';
  }

  return {
    saleDateKey,
    saleDate: saleInstantFromDateKey(saleDateKey),
    backdateApproval,
    requiresManagerApproval: isBackdated && !manager,
  };
}

export function isSaleCountedInReports(backdateApproval: string): boolean {
  return COUNTED_BACKDATE_APPROVALS.includes(backdateApproval as BackdateApprovalStatus);
}

export function saleDateInRange(saleDate: Date, start: Date, end: Date): boolean {
  const time = saleDate.getTime();
  return time >= start.getTime() && time < end.getTime();
}

export function getSaleBusinessDayKey(saleDate: Date): string {
  return getBusinessDayBounds(formatDateKeyInTimezone(saleDate)).dateKey;
}
