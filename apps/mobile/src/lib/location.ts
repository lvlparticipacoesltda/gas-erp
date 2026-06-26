import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import type { LocationTaskOptions } from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { getToken } from './storage';

export const LOCATION_TASK = 'gas-delivery-location-tracking';
const ACTIVE_DELIVERY_KEY = 'gas_active_delivery';

/** Intervalo de envio de pontos GPS (ms). */
const UPDATE_INTERVAL_MS = 45_000;

type LocationTaskData = { locations: Location.LocationObject[] };

type BatteryPayload = {
  batteryLevel?: number;
  batteryCharging?: boolean;
};

async function readBattery(): Promise<BatteryPayload> {
  try {
    const [level, state] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);
    return {
      batteryLevel: Math.round(level * 100),
      batteryCharging:
        state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL,
    };
  } catch {
    return {};
  }
}

async function sendPresence(
  token: string,
  location: Location.LocationObject,
  battery: BatteryPayload,
): Promise<void> {
  await api('/deliverers/me/position', {
    method: 'POST',
    token,
    body: {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
      ...battery,
    },
  });
}

// O handler precisa ser registrado no escopo global do bundle (import em _layout).
TaskManager.defineTask<LocationTaskData>(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const location = data?.locations?.[data.locations.length - 1];
  if (!location) return;

  const [deliveryId, token] = await Promise.all([
    SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY),
    getToken(),
  ]);
  if (!token) return;

  const battery = await readBattery();

  try {
    if (deliveryId) {
      await api(`/deliveries/${deliveryId}/tracking`, {
        method: 'POST',
        token,
        body: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? undefined,
          ...battery,
        },
      });
    } else {
      await sendPresence(token, location, battery);
    }
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
    const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
    if (!registered) return false;
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

function buildTrackingOptions(
  backgroundGranted: boolean,
  onDelivery: boolean,
): LocationTaskOptions {
  const base: LocationTaskOptions = {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: UPDATE_INTERVAL_MS,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
  };

  if (backgroundGranted) {
    base.showsBackgroundLocationIndicator = true;
    base.foregroundService = onDelivery
      ? {
          notificationTitle: 'Entrega em andamento',
          notificationBody: 'Compartilhando sua localização com a loja durante a rota.',
          notificationColor: '#F97316',
        }
      : {
          notificationTitle: 'Rastreamento ativo',
          notificationBody: 'Compartilhando sua posição com a loja enquanto você está online.',
          notificationColor: '#F97316',
        };
  }

  return base;
}

async function ensureLocationUpdates(onDelivery: boolean): Promise<PermissionResult> {
  const permissions = await requestLocationPermissions();
  if (!permissions.foreground) return permissions;

  const options = buildTrackingOptions(permissions.background, onDelivery);

  if (await isTrackingActive()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, options);
  } catch (err) {
    if (Platform.OS === 'android' && !permissions.background) {
      return permissions;
    }
    throw err;
  }

  return permissions;
}

/**
 * Inicia o envio periódico de posição de presença (sem rota ativa).
 * Chamado ao autenticar no app.
 */
export async function startPresenceTracking(): Promise<PermissionResult> {
  return ensureLocationUpdates(false);
}

/**
 * Inicia o envio periódico de pontos GPS para a entrega informada.
 * Mantém o rastreamento de presença ativo após encerrar a rota.
 */
export async function startDeliveryTracking(deliveryId: string): Promise<PermissionResult> {
  await SecureStore.setItemAsync(ACTIVE_DELIVERY_KEY, deliveryId);
  return ensureLocationUpdates(true);
}

/** Encerra apenas o modo rota; a presença contínua permanece ativa. */
export async function stopDeliveryTracking(): Promise<void> {
  await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
  if (await isTrackingActive()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
    await startPresenceTracking().catch(() => undefined);
  }
}

/** Encerra presença e rota (logout). */
export async function stopAllTracking(): Promise<void> {
  await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
  if (await isTrackingActive()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }
}

/**
 * Limpa estado órfão de rota e garante rastreamento de presença ao abrir o app autenticado.
 */
export async function recoverStaleLocationTracking(): Promise<void> {
  try {
    const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY);
    if (deliveryId) {
      const token = await getToken();
      if (token) {
        try {
          const deliveries = await api<Array<{ id: string; status: string }>>('/deliveries/my', {
            token,
          });
          const active = deliveries.find(
            (d) => d.id === deliveryId && d.status === 'IN_PROGRESS',
          );
          if (active) {
            if (!(await isTrackingActive())) {
              await startDeliveryTracking(deliveryId).catch(() => undefined);
            }
            return;
          }
          await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
        } catch {
          await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
        }
      }
    }

    if (!(await isTrackingActive())) {
      await startPresenceTracking().catch(() => undefined);
    }
  } catch {
    // Ignora — melhor abrir o app sem GPS do que crashar.
  }
}

/** Id da entrega cuja rota está ativa (persistido para sobreviver a reinícios). */
export async function getActiveDeliveryId(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY);
}
