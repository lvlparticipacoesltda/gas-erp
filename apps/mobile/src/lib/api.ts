import { getToken } from './storage';
import { SESSION_SUPERSEDED_CODE } from '@gas-erp/shared';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://api.thlgasdopovo.com.br/api/v1';

export class ApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized: ((error: ApiError) => void) | null = null;

/** Registra callback para sessão inválida (ex.: usuário inativado / login em outro lugar). */
export function setUnauthorizedHandler(handler: ((error: ApiError) => void) | null) {
  onUnauthorized = handler;
}

function extractMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const data = payload as Record<string, unknown>;
  const raw = data.message;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nested = raw as Record<string, unknown>;
    if (typeof nested.message === 'string') return nested.message;
  }
  if (Array.isArray(raw)) return raw.filter((m) => typeof m === 'string').join('. ');
  return fallback;
}

function extractCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.code === 'string') return data.code;
  const raw = data.message;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nested = raw as Record<string, unknown>;
    if (typeof nested.code === 'string') return nested.code;
  }
  return null;
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
    const code = extractCode(payload);
    const fallback =
      res.status === 413
        ? 'Foto grande demais para enviar. Tire outra foto e tente de novo.'
        : res.statusText || 'Erro na requisição';
    const message =
      code === SESSION_SUPERSEDED_CODE
        ? extractMessage(payload, 'Sua conta foi acessada de outro lugar. Faça login novamente.')
        : extractMessage(payload, fallback);
    const error = new ApiError(message, res.status, code);
    if (res.status === 401 && auth && bearer) {
      onUnauthorized?.(error);
    }
    throw error;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
