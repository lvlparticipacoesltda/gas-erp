import type { AuthUser } from '@gas-erp/shared';
import { parseApiError } from './errors';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

let refreshUserRequest: Promise<AuthUser | null> | null = null;

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(parseApiError(err, res.statusText));
  }
  return res.json();
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setAuth(token: string, user: unknown) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('currentStoreId');
  refreshUserRequest = null;
}

/** Atualiza permissões e dados do usuário a partir da API (ex.: após alteração no painel master). */
export function refreshStoredUser(): Promise<AuthUser | null> {
  if (refreshUserRequest) return refreshUserRequest;

  refreshUserRequest = (async () => {
    const token = getToken();
    if (!token) return null;

    const me = await api<
      AuthUser & { phone?: string | null; stores?: unknown; organization?: unknown }
    >('/auth/me', {}, token);

    const authUser: AuthUser = {
      id: me.id,
      email: me.email,
      name: me.name,
      role: me.role,
      organizationId: me.organizationId,
      storeIds: me.storeIds,
      permissions: me.permissions,
    };
    localStorage.setItem('user', JSON.stringify(authUser));
    return authUser;
  })().finally(() => {
    refreshUserRequest = null;
  });

  return refreshUserRequest;
}

export function getStoredUser<T>(): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  return raw ? (JSON.parse(raw) as T) : null;
}

export function getCurrentStoreId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('currentStoreId');
}

export function setCurrentStoreId(storeId: string) {
  localStorage.setItem('currentStoreId', storeId);
}
