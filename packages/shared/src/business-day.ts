/** Dia operacional das lojas (fuso America/Sao_Paulo). */

export const DEFAULT_STORE_TIMEZONE = 'America/Sao_Paulo';

export function formatDateKeyInTimezone(date: Date, timeZone: string = DEFAULT_STORE_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function calendarDayDiff(
  targetYear: number,
  targetMonth: number,
  targetDay: number,
  zonedYear: number,
  zonedMonth: number,
  zonedDay: number,
): number {
  const targetMs = Date.UTC(targetYear, targetMonth - 1, targetDay);
  const zonedMs = Date.UTC(zonedYear, zonedMonth - 1, zonedDay);
  return Math.round((targetMs - zonedMs) / 86_400_000);
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Converte data/hora local da loja para instante UTC. */
export function zonedTimeToUtc(
  dateKey: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = DEFAULT_STORE_TIMEZONE,
): Date {
  const [y, mo, d] = dateKey.split('-').map(Number);
  let utcMs = Date.UTC(y, mo - 1, d, hour, minute, second);

  for (let i = 0; i < 4; i++) {
    const z = getZonedParts(new Date(utcMs), timeZone);
    const targetSec = hour * 3600 + minute * 60 + second;
    const actualSec = z.hour * 3600 + z.minute * 60 + z.second;
    const dayDelta = calendarDayDiff(y, mo, d, z.year, z.month, z.day);
    const adjustSec = dayDelta * 86400 + (targetSec - actualSec);
    if (adjustSec === 0) break;
    utcMs += adjustSec * 1000;
  }

  return new Date(utcMs);
}

/** Intervalo [início, fim) do dia operacional em UTC. */
export function getBusinessDayBounds(
  dateKey?: string,
  timeZone: string = DEFAULT_STORE_TIMEZONE,
): { start: Date; end: Date; dateKey: string } {
  const key = dateKey ?? formatDateKeyInTimezone(new Date(), timeZone);
  const start = zonedTimeToUtc(key, 0, 0, 0, timeZone);
  const end = zonedTimeToUtc(addDaysToDateKey(key, 1), 0, 0, 0, timeZone);
  return { start, end, dateKey: key };
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: string): boolean {
  return DATE_KEY_RE.test(value);
}

/** Intervalo inclusivo de dias operacionais [início do from, início do dia após to) em UTC. */
export function getBusinessDayRangeBounds(
  fromDateKey: string,
  toDateKey?: string,
  timeZone: string = DEFAULT_STORE_TIMEZONE,
): { start: Date; end: Date; dateFrom: string; dateTo: string } {
  const dateFrom = fromDateKey;
  const dateTo = toDateKey ?? fromDateKey;
  if (!isValidDateKey(dateFrom) || !isValidDateKey(dateTo)) {
    throw new Error('Data inválida. Use o formato AAAA-MM-DD.');
  }
  if (dateFrom > dateTo) {
    throw new Error('A data inicial não pode ser posterior à data final.');
  }
  const start = zonedTimeToUtc(dateFrom, 0, 0, 0, timeZone);
  const end = zonedTimeToUtc(addDaysToDateKey(dateTo, 1), 0, 0, 0, timeZone);
  return { start, end, dateFrom, dateTo };
}

export type DashboardDateQuery = {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function resolveDashboardDateRange(
  query: DashboardDateQuery,
  timeZone: string = DEFAULT_STORE_TIMEZONE,
): { start: Date; end: Date; dateFrom: string; dateTo: string } {
  const { date, dateFrom, dateTo } = query;
  if (dateFrom || dateTo) {
    return getBusinessDayRangeBounds(dateFrom ?? dateTo!, dateTo ?? dateFrom, timeZone);
  }
  if (date) {
    const single = getBusinessDayBounds(date, timeZone);
    return { start: single.start, end: single.end, dateFrom: single.dateKey, dateTo: single.dateKey };
  }
  const today = getBusinessDayBounds(undefined, timeZone);
  return { start: today.start, end: today.end, dateFrom: today.dateKey, dateTo: today.dateKey };
}

export function formatDashboardDateRangeLabel(dateFrom: string, dateTo: string): string {
  const fmt = (key: string) => key.split('-').reverse().join('/');
  if (dateFrom === dateTo) return fmt(dateFrom);
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
}

export function todayDateKey(timeZone: string = DEFAULT_STORE_TIMEZONE): string {
  return formatDateKeyInTimezone(new Date(), timeZone);
}

export function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
