import { Alert } from 'react-native';
import type { DelivererMeStore } from '@gas-erp/shared';
import { api } from './api';
import { promptNavigateHome, type NavigationDestination } from './navigation';

/** Monta texto de endereço da loja para Maps/Waze (fallback sem coords). */
export function buildStoreAddress(store: DelivererMeStore): string {
  const parts: string[] = [];
  const street = [store.street, store.number].filter(Boolean).join(', ');
  if (street) parts.push(street);
  if (store.complement) parts.push(store.complement);
  if (store.neighborhood) parts.push(store.neighborhood);
  const city = [store.city, store.state].filter(Boolean).join(' - ');
  if (city) parts.push(city);
  if (store.zipCode) parts.push(store.zipCode);
  if (store.landmark) parts.push(`Ref.: ${store.landmark}`);
  if (parts.length) return parts.join(', ');
  return store.address?.trim() ?? '';
}

export function storeHasNavigableAddress(store: DelivererMeStore): boolean {
  if (
    typeof store.latitude === 'number' &&
    Number.isFinite(store.latitude) &&
    typeof store.longitude === 'number' &&
    Number.isFinite(store.longitude)
  ) {
    return true;
  }
  return Boolean(buildStoreAddress(store));
}

export function toStoreDestination(store: DelivererMeStore): NavigationDestination {
  return {
    latitude: store.latitude,
    longitude: store.longitude,
    address: buildStoreAddress(store) || store.address,
  };
}

export async function fetchMyStores(): Promise<DelivererMeStore[]> {
  const me = await api<{ stores?: DelivererMeStore[] }>('/deliverers/me');
  return me.stores ?? [];
}

export function openHomeForStore(store: DelivererMeStore): void {
  if (!storeHasNavigableAddress(store)) {
    Alert.alert(
      'Endereço incompleto',
      `A loja "${store.name}" ainda não tem endereço cadastrado. Peça ao master para configurar o endereço da unidade.`,
    );
    return;
  }
  promptNavigateHome(toStoreDestination(store), store.name);
}
