import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { syncDelivererAvailabilityFromServer } from './deliverer-availability-context';
import { api } from './api';

/** Aguarda prompts de localização na primeira abertura antes de pedir notificações. */
const PUSH_REGISTER_DELAY_MS = 4_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('deliveries', {
    name: 'Entregas',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FB5E13',
    sound: 'default',
  });
}

/** Solicita permissão e obtém Expo Push Token (null em emulador ou sem permissão). */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    if (existing === 'denied') return null;
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export async function registerPushTokenWithApi(): Promise<boolean> {
  const token = await getExpoPushToken();
  if (!token) return false;
  await api('/deliverers/me/push-token', {
    method: 'PUT',
    body: { token },
  });
  return true;
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

/** Registra token, escuta notificações e atualiza lista / deep link. */
export function usePushNotifications(onRefresh: () => void | Promise<void>) {
  const router = useRouter();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    let cancelled = false;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;

    const tryRegister = () => {
      void registerPushTokenWithApi().catch((err) => {
        if (__DEV__) {
          console.warn('[push] falha ao registrar token:', err);
        }
      });
    };

    delayTimer = setTimeout(() => {
      if (!cancelled) tryRegister();
    }, PUSH_REGISTER_DELAY_MS);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryRegister();
    });

    const received = Notifications.addNotificationReceivedListener((event) => {
      const data = event.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'AVAILABILITY_CHANGED') {
        void syncDelivererAvailabilityFromServer().catch(() => undefined);
      }
      void Promise.resolve(onRefreshRef.current());
    });

    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const data = event.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'AVAILABILITY_CHANGED') {
        void syncDelivererAvailabilityFromServer().catch(() => undefined);
        void Promise.resolve(onRefreshRef.current());
        return;
      }
      const deliveryId = getDeliveryIdFromNotification(data);
      if (deliveryId) {
        router.push(`/delivery/${deliveryId}`);
      } else {
        void onRefreshRef.current();
      }
    });

    return () => {
      cancelled = true;
      if (delayTimer) clearTimeout(delayTimer);
      appStateSub.remove();
      received.remove();
      response.remove();
    };
  }, [router]);
}
