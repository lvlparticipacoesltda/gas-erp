import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { api } from './api';

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

export async function registerPushTokenWithApi(): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) return;
  await api('/deliverers/me/push-token', {
    method: 'PUT',
    body: { token },
  });
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
export function usePushNotifications(onRefresh: () => Promise<void>) {
  const router = useRouter();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    registerPushTokenWithApi().catch(() => undefined);

    const received = Notifications.addNotificationReceivedListener(() => {
      void onRefreshRef.current();
    });

    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const deliveryId = getDeliveryIdFromNotification(
        event.notification.request.content.data as Record<string, unknown>,
      );
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
