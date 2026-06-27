import { Alert, AppState, type AppStateStatus, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import type { LocationTaskOptions } from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { getToken } from './storage';

export const LOCATION_TASK = 'gas-delivery-location-tracking';
const ACTIVE_DELIVERY_KEY = 'gas_active_delivery';

/** Intervalo de envio em background (ms) — abaixo do limite "ao vivo" na API. */
const UPDATE_INTERVAL_MS = 20_000;
/** Intervalo de envio com app em primeiro plano (ms). */
const FOREGROUND_PRESENCE_INTERVAL_MS = 15_000;

let foregroundIntervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
/** Quando true, presença (sem rota) não envia GPS — ex.: indisponível pela loja. */
let presenceSharingPaused = false;
/** Evita prompts de permissão sobrepostos quando vários fluxos iniciam GPS ao mesmo tempo. */
let permissionsInFlight: Promise<PermissionResult> | null = null;
let locationSetupInFlight: Promise<PermissionResult> | null = null;
/** Evita reexibir o diálogo de permissão de localização a cada sync de 30s. Não afeta envio de GPS. */
let locationPermissionPromptedThisSession = false;

type LocationTaskData = { locations: Location.LocationObject[] };

type BatteryPayload = {
  batteryLevel?: number;
  batteryCharging?: boolean;
};

/**
 * Divulgação destacada (Google Play) antes do prompt de localização em segundo plano.
 * Deve aparecer ANTES de requestBackgroundPermissionsAsync.
 */
export function confirmBackgroundLocationDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Uso da sua localização',
      'Enquanto você estiver disponível para a loja, o app compartilha sua posição — inclusive com o app em segundo plano — para aparecer no mapa de entregadores. Durante uma rota, o trajeto também é registrado até a conclusão. Quando a loja marcar você como indisponível, o compartilhamento é interrompido.',
      [
        { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Permitir', style: 'default', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

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

async function sendLocationUpdate(
  token: string,
  location: Location.LocationObject,
  battery: BatteryPayload,
  deliveryId: string | null,
): Promise<void> {
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
}

/** Envia posição e bateria imediatamente (foreground ou ao voltar ao app). */
export async function sendPresenceNow(): Promise<void> {
  const token = await getToken();
  if (!token) return;

  const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY);
  if (!deliveryId && presenceSharingPaused) return;

  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return;

  try {
    const [location, battery] = await Promise.all([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      readBattery(),
    ]);
    await sendLocationUpdate(token, location, battery, deliveryId);
  } catch {
    // Rede ou GPS indisponível — o próximo ciclo tentará de novo.
  }
}

function startForegroundPresenceLoop(): void {
  if (foregroundIntervalId) return;
  void sendPresenceNow();
  foregroundIntervalId = setInterval(() => {
    void sendPresenceNow();
  }, FOREGROUND_PRESENCE_INTERVAL_MS);
}

function stopForegroundPresenceLoop(): void {
  if (!foregroundIntervalId) return;
  clearInterval(foregroundIntervalId);
  foregroundIntervalId = null;
}

async function getActiveDeliveryMode(): Promise<boolean> {
  const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY);
  return !!deliveryId;
}

/** Garante que o task de background está ativo durante rota; para presença usa só foreground. */
async function ensureBackgroundTaskRunning(): Promise<void> {
  const token = await getToken();
  if (!token) return;

  const onDelivery = await getActiveDeliveryMode();
  if (!onDelivery) {
    if (await isTrackingActive()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
    }
    return;
  }

  if (!(await isTrackingActive())) {
    await ensureLocationUpdates(true).catch(() => undefined);
  }
}

function handleAppStateChange(state: AppStateStatus): void {
  if (state === 'active') {
    if (!presenceSharingPaused) {
      startForegroundPresenceLoop();
      void ensurePresenceTrackingFresh();
    }
    return;
  }

  stopForegroundPresenceLoop();
  if (presenceSharingPaused) return;

  void (async () => {
    await sendPresenceNow();
    const onDelivery = await getActiveDeliveryMode();
    if (onDelivery) {
      await ensureBackgroundTaskRunning();
    } else if (await isTrackingActive()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
    }
  })();
}

/** Listener de AppState: envio rápido em foreground e imediato ao voltar ao app. */
export function initForegroundPresence(): void {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  if (AppState.currentState === 'active' && !presenceSharingPaused) {
    startForegroundPresenceLoop();
  }
}

export function teardownForegroundPresence(): void {
  stopForegroundPresenceLoop();
  appStateSubscription?.remove();
  appStateSubscription = null;
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
  if (!deliveryId && presenceSharingPaused) return;

  const battery = await readBattery();

  try {
    await sendLocationUpdate(token, location, battery, deliveryId);
  } catch {
    try {
      await sendLocationUpdate(token, location, battery, deliveryId);
    } catch {
      // Próximo ponto do task tentará novamente.
    }
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

/** Solicita background com divulgação destacada quando ainda não concedida. */
export async function requestLocationPermissionsWithDisclosure(): Promise<PermissionResult> {
  if (permissionsInFlight) {
    return permissionsInFlight;
  }

  permissionsInFlight = requestLocationPermissionsWithDisclosureOnce();
  try {
    return await permissionsInFlight;
  } finally {
    permissionsInFlight = null;
  }
}

/**
 * Exibe o diálogo de permissão de localização (uma vez por sessão, após login).
 * Não envia posição — isso é feito por startPresenceTracking / syncPresenceSharingEnabled.
 */
export async function promptLocationPermissionsAfterLogin(): Promise<PermissionResult> {
  if (locationPermissionPromptedThisSession) {
    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    return {
      foreground: fg.status === 'granted',
      background: bg?.status === 'granted',
    };
  }
  locationPermissionPromptedThisSession = true;
  return requestLocationPermissionsWithDisclosure();
}

async function requestLocationPermissionsWithDisclosureOnce(): Promise<PermissionResult> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    if (fg.status === 'denied' && fg.canAskAgain === false) {
      return { foreground: false, background: false };
    }
    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.status !== 'granted') return { foreground: false, background: false };
  }

  const existingBg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  if (existingBg?.status === 'granted') {
    return { foreground: true, background: true };
  }
  if (existingBg?.status === 'denied' && existingBg.canAskAgain === false) {
    return { foreground: true, background: false };
  }

  const consent = await confirmBackgroundLocationDisclosure();
  if (!consent) {
    return { foreground: true, background: false };
  }

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
    accuracy: onDelivery ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: UPDATE_INTERVAL_MS,
    // Presença parada: distanceInterval bloqueia updates no Android; rota usa distância.
    distanceInterval: onDelivery ? 25 : 0,
    pausesUpdatesAutomatically: false,
    activityType: onDelivery
      ? Location.ActivityType.OtherNavigation
      : Location.ActivityType.Other,
    showsBackgroundLocationIndicator: true,
  };

  if (Platform.OS === 'android') {
    if (onDelivery) {
      base.foregroundService = {
        notificationTitle: 'Entrega em andamento',
        notificationBody: 'Compartilhando sua localização com a loja durante a rota.',
        notificationColor: '#F97316',
      };
    }
  } else if (backgroundGranted) {
    base.showsBackgroundLocationIndicator = true;
  }

  return base;
}

async function ensureLocationUpdates(onDelivery: boolean): Promise<PermissionResult> {
  if (locationSetupInFlight) {
    return locationSetupInFlight;
  }

  locationSetupInFlight = ensureLocationUpdatesOnce(onDelivery);
  try {
    return await locationSetupInFlight;
  } finally {
    locationSetupInFlight = null;
  }
}

async function ensureLocationUpdatesOnce(onDelivery: boolean): Promise<PermissionResult> {
  const permissions = await requestLocationPermissionsWithDisclosure();
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

/** Sincroniza compartilhamento de GPS com disponibilidade definida pela loja. */
export async function syncPresenceSharingEnabled(sharingEnabled: boolean): Promise<void> {
  const hasDelivery = await getActiveDeliveryMode();

  if (hasDelivery) {
    presenceSharingPaused = false;
    if (!(await isTrackingActive())) {
      const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY);
      if (deliveryId) {
        await startDeliveryTracking(deliveryId).catch(() => undefined);
      }
    }
    return;
  }

  if (!sharingEnabled) {
    presenceSharingPaused = true;
    stopForegroundPresenceLoop();
    if (await isTrackingActive()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
    }
    return;
  }

  presenceSharingPaused = false;
  if (AppState.currentState === 'active') {
    startForegroundPresenceLoop();
  }
  if (!(await isTrackingActive())) {
    await startPresenceTracking().catch(() => undefined);
  }
}

export function isPresenceSharingPaused(): boolean {
  return presenceSharingPaused;
}

/**
 * Inicia o envio periódico de posição de presença (sem rota ativa).
 * Chamado ao autenticar no app quando disponível.
 */
export async function startPresenceTracking(): Promise<PermissionResult> {
  if (presenceSharingPaused) {
    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    return { foreground: fg.status === 'granted', background: bg?.status === 'granted' };
  }
  initForegroundPresence();
  if (AppState.currentState === 'active') {
    startForegroundPresenceLoop();
  }
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  return { foreground: fg.status === 'granted', background: bg?.status === 'granted' };
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
  presenceSharingPaused = false;
  locationPermissionPromptedThisSession = false;
  teardownForegroundPresence();
  await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
  if (await isTrackingActive()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }
}

/** Reinicia rastreamento em background somente durante rota ativa. */
async function ensurePresenceTrackingFresh(): Promise<void> {
  if (presenceSharingPaused) return;
  const onDelivery = await getActiveDeliveryMode();
  if (!onDelivery) {
    if (await isTrackingActive()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
    }
    return;
  }
  if (!(await isTrackingActive())) {
    await ensureLocationUpdates(true).catch(() => undefined);
  }
}

/**
 * Limpa estado órfão de rota e garante rastreamento de presença ao abrir o app autenticado.
 */
export async function recoverStaleLocationTracking(): Promise<void> {
  try {
    if (presenceSharingPaused) return;

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

    await ensurePresenceTrackingFresh();
  } catch {
    // Ignora — melhor abrir o app sem GPS do que crashar.
  }
}

/** Id da entrega cuja rota está ativa (persistido para sobreviver a reinícios). */
export async function getActiveDeliveryId(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY);
}

export interface GeocodedAddress {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  landmark?: string;
}

function normalizeState(region?: string | null): string | undefined {
  if (!region) return undefined;
  const trimmed = region.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return undefined;
}

/** Obtém endereço aproximado a partir da posição GPS atual do entregador. */
export async function getCurrentDeliveryAddress(): Promise<GeocodedAddress | null> {
  const permissions = await requestLocationPermissionsWithDisclosure();
  if (!permissions.foreground) return null;

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const [results] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    if (!results) {
      return {
        landmark: `GPS ${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`,
      };
    }

    return {
      street: results.street ?? results.name ?? undefined,
      number: results.streetNumber ?? undefined,
      neighborhood: results.district ?? results.subregion ?? undefined,
      city: results.city ?? results.subregion ?? undefined,
      state: normalizeState(results.isoCountryCode === 'BR' ? results.region : results.region),
      landmark: `GPS ${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`,
    };
  } catch {
    return null;
  }
}
