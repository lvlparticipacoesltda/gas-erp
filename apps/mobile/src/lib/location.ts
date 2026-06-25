import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { getToken } from './storage';

export const LOCATION_TASK = 'gas-delivery-location-tracking';
const ACTIVE_DELIVERY_KEY = 'gas_active_delivery';

/** Intervalo de envio de pontos GPS (ms). Mantém-se na faixa de 30–60s do plano. */
const UPDATE_INTERVAL_MS = 45_000;

type LocationTaskData = { locations: Location.LocationObject[] };

// O handler precisa ser registrado no escopo global do bundle (import em _layout).
TaskManager.defineTask<LocationTaskData>(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const location = data?.locations?.[data.locations.length - 1];
  if (!location) return;

  const [deliveryId, token] = await Promise.all([
    SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY),
    getToken(),
  ]);
  if (!deliveryId || !token) return;

  try {
    await api(`/deliveries/${deliveryId}/tracking`, {
      method: 'POST',
      token,
      body: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
      },
    });
  } catch {
    // Erros de rede em background são ignorados; o próximo ponto tentará de novo.
  }
});

export interface PermissionResult {
  foreground: boolean;
  background: boolean;
}

/** Solicita permissão de localização em foreground e, se possível, em background. */
export async function requestLocationPermissions(): Promise<PermissionResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { foreground: false, background: false };

  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  return { foreground: true, background: bg?.status === 'granted' };
}

/** Indica se a permissão de localização em segundo plano já foi concedida. */
export async function hasBackgroundPermission(): Promise<boolean> {
  const res = await Location.getBackgroundPermissionsAsync().catch(() => null);
  return res?.status === 'granted';
}

export async function isTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Inicia o envio periódico de pontos GPS para a entrega informada.
 * Retorna as permissões obtidas (foreground é obrigatório).
 */
export async function startDeliveryTracking(deliveryId: string): Promise<PermissionResult> {
  const permissions = await requestLocationPermissions();
  if (!permissions.foreground) return permissions;

  await SecureStore.setItemAsync(ACTIVE_DELIVERY_KEY, deliveryId);

  // Garante uma única rota ativa: encerra qualquer tracking anterior.
  if (await isTrackingActive()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: UPDATE_INTERVAL_MS,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Entrega em andamento',
      notificationBody: 'Compartilhando sua localização com a loja durante a rota.',
      notificationColor: '#F97316',
    },
  });

  return permissions;
}

/** Encerra o envio de pontos GPS e limpa a entrega ativa. */
export async function stopDeliveryTracking(): Promise<void> {
  await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
  if (await isTrackingActive()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }
}

/** Id da entrega cuja rota está ativa (persistido para sobreviver a reinícios). */
export async function getActiveDeliveryId(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY);
}
