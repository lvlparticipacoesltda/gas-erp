import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { DELIVERY_PUSH_CHANNEL_ID, DELIVERY_PUSH_SOUND } from '@gas-erp/shared';
import { syncDelivererAvailabilityFromServer } from './deliverer-availability-context';
import { api } from './api';
import { getToken } from './storage';

/** Fallback se Constants não expuser o projectId no build standalone. */
const EAS_PROJECT_ID = '165eab5a-801a-45a3-ae81-e0a6ef28e7f3';

const PUSH_LOG = '[push]';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let notificationPermissionFlow: Promise<boolean> | null = null;

function logPush(message: string, detail?: string) {
  const line = detail ? `${message}: ${detail}` : message;
  console.warn(PUSH_LOG, line);
}

function resolveEasProjectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    EAS_PROJECT_ID
  );
}

function startNotificationPermissionFlow(): Promise<boolean> {
  if (!notificationPermissionFlow) {
    notificationPermissionFlow = requestNotificationPermissionOnAppOpen();
  }
  return notificationPermissionFlow;
}

/** Aguarda o fluxo de notificação na abertura antes de pedir localização. */
export function waitForNotificationPermissionFlow(): Promise<boolean> {
  return startNotificationPermissionFlow();
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DELIVERY_PUSH_CHANNEL_ID, {
    name: 'Entregas',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FB5E13',
    sound: DELIVERY_PUSH_SOUND,
  });
}

export async function requestNotificationPermissionOnAppOpen(): Promise<boolean> {
  if (!Device.isDevice) return false;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  if (existing.status === 'denied' && existing.canAskAgain === false) return false;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return requested.status === 'granted';
}

async function getExpoPushTokenIfGranted(): Promise<{ token: string | null; error?: string }> {
  if (!Device.isDevice) {
    return { token: null, error: 'emulador — use celular físico' };
  }

  await ensureAndroidChannel();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return { token: null, error: 'permissão de notificação não concedida' };
  }

  const projectId = resolveEasProjectId();
  if (!projectId) {
    return { token: null, error: 'EAS projectId não encontrado no build' };
  }

  try {
    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!pushToken.data.startsWith('ExponentPushToken[')) {
      return { token: null, error: `formato inesperado: ${pushToken.data.slice(0, 40)}...` };
    }
    return { token: pushToken.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { token: null, error: msg };
  }
}

export type PushSyncResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Obtém Expo Push Token e envia à API (requer login + permissão + FCM no build Android).
 */
export async function syncPushTokenWithApi(accessToken?: string): Promise<PushSyncResult> {
  await waitForNotificationPermissionFlow().catch(() => false);

  const jwt = accessToken ?? (await getToken());
  if (!jwt) {
    return { ok: false, reason: 'sem sessão (faça login)' };
  }

  const { token: pushToken, error: tokenError } = await getExpoPushTokenIfGranted();
  if (!pushToken) {
    if (tokenError) {
      logPush('falha ao obter Expo Push Token', tokenError);
      if (/firebase|FCM|FirebaseApp/i.test(tokenError)) {
        logPush(
          'configure FCM no Firebase + EAS e gere novo APK',
          'ver docs/mobile-push-fcm.md',
        );
      }
    }
    return { ok: false, reason: tokenError ?? 'token Expo indisponível' };
  }

  try {
    await api('/deliverers/me/push-token', {
      method: 'PUT',
      body: { token: pushToken },
      token: jwt,
    });
    logPush('token registrado na API');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logPush('erro ao enviar token à API', msg);
    return { ok: false, reason: msg };
  }
}

export async function registerPushTokenWithApi(accessToken?: string): Promise<boolean> {
  const result = await syncPushTokenWithApi(accessToken);
  return result.ok;
}

export async function syncPushWithRetries(accessToken?: string, attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    const result = await syncPushTokenWithApi(accessToken);
    if (result.ok) return;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

export async function clearPushTokenOnServer(): Promise<void> {
  try {
    await api('/deliverers/me/push-token', { method: 'DELETE' });
  } catch {
    // Sessão pode já ter expirado no logout.
  }
}

function getDeliveryIdFromNotification(
  data: Record<string, unknown> | undefined,
): string | undefined {
  const deliveryId = data?.deliveryId;
  return typeof deliveryId === 'string' ? deliveryId : undefined;
}

export function useNotificationPermissionOnAppOpen() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startNotificationPermissionFlow().catch(() => undefined);
  }, []);
}

export function usePushNotifications(onRefresh: () => void | Promise<void>) {
  const router = useRouter();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => {
      void Promise.resolve(onRefreshRef.current());
    });

    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const data = event.notification.request.content.data as Record<string, unknown>;
      const deliveryId = getDeliveryIdFromNotification(data);
      if (deliveryId) {
        router.push(`/delivery/${deliveryId}`);
      } else {
        void onRefreshRef.current();
      }
    });

    return () => {
      received.remove();
      response.remove();
    };
  }, [router]);
}

export function useRegisterPushTokenWhenAuthenticated() {
  useEffect(() => {
    void syncPushWithRetries();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncPushWithRetries();
      }
    });

    return () => sub.remove();
  }, []);
}
