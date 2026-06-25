import * as SecureStore from 'expo-secure-store';
import type { AuthUser, Organization } from '../types';

const TOKEN_KEY = 'gas_token';
const USER_KEY = 'gas_user';
const ORG_KEY = 'gas_org';

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
