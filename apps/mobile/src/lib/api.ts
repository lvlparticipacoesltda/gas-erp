import { getToken } from './storage';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://gas-erpapi-production.up.railway.app/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

/** Registra callback para sessão inválida (ex.: usuário inativado). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function extractMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const raw = (payload as Record<string, unknown>).message;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.filter((m) => typeof m === 'string').join('. ');
  return fallback;
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
  /** Quando false, não busca o token do secure-store automaticamente. */
  auth?: boolean;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, token, auth = true, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  const bearer = token ?? (auth ? await getToken() : null);
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 401 && auth && bearer) {
      onUnauthorized?.();
    }
    throw new ApiError(extractMessage(payload, res.statusText || 'Erro na requisição'), res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
