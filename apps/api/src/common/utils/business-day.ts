import type { DashboardDateQuery } from '@gas-erp/shared';

/** Desde 2019 o Brasil não usa horário de verão — SP é sempre UTC-3. */
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

function saoPauloMidnightUtc(dateKey: string): Date {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
}

function assertValidDateKey(value: string) {
  if (!DATE_KEY_RE.test(value)) {
    throw new Error('Data inválida. Use o formato AAAA-MM-DD.');
  }
}

/** Intervalo [início, fim) do dia operacional em UTC (America/Sao_Paulo). */
export function getBusinessDayBounds(dateKey: string): { start: Date; end: Date; dateKey: string } {
  assertValidDateKey(dateKey);
  const start = saoPauloMidnightUtc(dateKey);
  const end = saoPauloMidnightUtc(addDaysToDateKey(dateKey, 1));
  return { start, end, dateKey };
}

export function getBusinessDayRangeBounds(
  fromDateKey: string,
  toDateKey: string,
): { start: Date; end: Date; dateFrom: string; dateTo: string } {
  assertValidDateKey(fromDateKey);
  assertValidDateKey(toDateKey);
  if (fromDateKey > toDateKey) {
    throw new Error('A data inicial não pode ser posterior à data final.');
  }

  const start = saoPauloMidnightUtc(fromDateKey);
  const end = saoPauloMidnightUtc(addDaysToDateKey(toDateKey, 1));
  if (end <= start) {
    throw new Error(`Intervalo de datas inválido (${fromDateKey} a ${toDateKey}).`);
  }

  return { start, end, dateFrom: fromDateKey, dateTo: toDateKey };
}

export function resolveDashboardDateRange(
  query: DashboardDateQuery,
): { start: Date; end: Date; dateFrom: string; dateTo: string } {
  const { date, dateFrom, dateTo } = query;

  if (dateFrom || dateTo) {
    return getBusinessDayRangeBounds(dateFrom ?? dateTo!, dateTo ?? dateFrom!);
  }

  if (date) {
    const single = getBusinessDayBounds(date);
    return {
      start: single.start,
      end: single.end,
      dateFrom: single.dateKey,
      dateTo: single.dateKey,
    };
  }

  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  const today = getBusinessDayBounds(todayKey);
  return { start: today.start, end: today.end, dateFrom: today.dateKey, dateTo: today.dateKey };
}

/** Autoteste rápido usado no health check. */
export function verifyBusinessDayRanges(): { ok: boolean; sample: string } {
  const sample = getBusinessDayBounds('2026-06-30');
  const ok = sample.end > sample.start && sample.end.toISOString() === '2026-07-01T03:00:00.000Z';
  return { ok, sample: `${sample.start.toISOString()}..${sample.end.toISOString()}` };
}
