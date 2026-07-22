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
