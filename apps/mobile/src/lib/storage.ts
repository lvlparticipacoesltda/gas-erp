import * as SecureStore from 'expo-secure-store';
import type { AuthUser, Organization } from '../types';

const TOKEN_KEY = 'gas_token';
const USER_KEY = 'gas_user';
const ORG_KEY = 'gas_org';
const DEVICE_ID_KEY = 'gas_device_id';

/** ID estável do aparelho (pareamento / sessão mobile). */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

export async function saveSession(
  token: string,
  user: AuthUser,
  organization: Organization | null,
): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  if (organization) {
    await SecureStore.setItemAsync(ORG_KEY, JSON.stringify(organization));
  }
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function getStoredOrganization(): Promise<Organization | null> {
  const raw = await SecureStore.getItemAsync(ORG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Organization;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(ORG_KEY);
}
