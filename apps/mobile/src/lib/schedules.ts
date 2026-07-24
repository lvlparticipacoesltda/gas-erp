import { api } from './api';
import type { ScheduleDayType, TimeClockPunchType } from '@gas-erp/shared';

export interface ScheduleEntryDto {
  id: string;
  date: string;
  dayType: ScheduleDayType;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  notes: string | null;
  storeId?: string;
  storeName?: string;
}

export interface MyScheduleMonth {
  store: { id: string; name: string; latitude: number | null; longitude: number | null };
  year: number;
  month: number;
  daysInMonth: number;
  collaborators: Array<{
    id: string;
    name: string;
    entries: ScheduleEntryDto[];
  }>;
}

export interface TimeClockMe {
  date: string;
  store: { id: string; name: string; latitude: number | null; longitude: number | null } | null;
  nextType: TimeClockPunchType;
  punches: Array<{
    id: string;
    type: TimeClockPunchType;
    punchedAt: string;
    distanceMeters: number | null;
    source: string;
  }>;
  schedule: Omit<ScheduleEntryDto, 'date'> | null;
  geofenceMeters: number;
}

export function fetchMySchedule(year: number, month: number, storeId?: string) {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (storeId) params.set('storeId', storeId);
  return api<MyScheduleMonth>(`/schedules/me?${params.toString()}`);
}

export function fetchMyTimeClock(storeId: string, date?: string) {
  const params = new URLSearchParams({ storeId });
  if (date) params.set('date', date);
  return api<TimeClockMe>(`/time-clock/me?${params.toString()}`);
}

export function punchTimeClock(input: {
  storeId: string;
  type: TimeClockPunchType;
  latitude: number;
  longitude: number;
  accuracy?: number;
  photoBase64: string;
}) {
  return api('/time-clock/punch', {
    method: 'POST',
    body: {
      storeId: input.storeId,
      type: input.type,
      source: 'MOBILE',
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      photoBase64: input.photoBase64,
    },
  });
}

export type PunchSlotKey = 'ent1' | 'sai1' | 'ent2' | 'sai2';

export const PUNCH_SLOT_LABELS: Record<PunchSlotKey, string> = {
  ent1: 'ENT.1',
  sai1: 'SAÍ.1',
  ent2: 'ENT.2',
  sai2: 'SAÍ.2',
};

/** Mapeia batidas do dia para os 4 slots do cartão (1º IN, 1º OUT, 2º IN, 2º OUT). */
export function mapPunchesToSlots(
  punches: TimeClockMe['punches'],
): Record<PunchSlotKey, string | null> {
  const ordered = [...punches].sort(
    (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime(),
  );
  const ins = ordered.filter((p) => p.type === 'CLOCK_IN');
  const outs = ordered.filter((p) => p.type === 'CLOCK_OUT');

  const fmt = (iso?: string) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return {
    ent1: fmt(ins[0]?.punchedAt),
    sai1: fmt(outs[0]?.punchedAt),
    ent2: fmt(ins[1]?.punchedAt),
    sai2: fmt(outs[1]?.punchedAt),
  };
}

/** Qual slot será preenchido na próxima batida. */
export function nextPunchSlot(punches: TimeClockMe['punches']): PunchSlotKey {
  const slots = mapPunchesToSlots(punches);
  if (!slots.ent1) return 'ent1';
  if (!slots.sai1) return 'sai1';
  if (!slots.ent2) return 'ent2';
  return 'sai2';
}
