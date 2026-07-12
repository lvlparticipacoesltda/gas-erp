import { getToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export type RealtimeChannel =
  | { type: 'store'; storeId: string }
  | { type: 'org' };

export function buildRealtimeUrl(channel: RealtimeChannel, token?: string | null): string | null {
  const authToken = token ?? getToken();
  if (!authToken) return null;

  const params = new URLSearchParams({ token: authToken });
  if (channel.type === 'store') {
    params.set('storeId', channel.storeId);
    return `${API_URL}/realtime/store?${params.toString()}`;
  }
  return `${API_URL}/realtime/org?${params.toString()}`;
}

export function isRealtimeHeartbeat(payload: unknown): boolean {
  return Boolean(
    payload
    && typeof payload === 'object'
    && 'type' in payload
    && (payload as { type?: string }).type === 'heartbeat',
  );
}
