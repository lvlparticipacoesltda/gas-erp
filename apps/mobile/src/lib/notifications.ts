import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { syncDelivererAvailabilityFromServer } from './deliverer-availability-context';
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

let prePromptShownThisSession = false;
let declinedPrePromptThisSession = false;
let notificationPermissionFlow: Promise<boolean> | null = null;

function startNotificationPermissionFlow(options?: {
  skipPrePrompt?: boolean;
}): Promise<boolean> {
  if (!notificationPermissionFlow) {
    notificationPermissionFlow = requestNotificationPermissionOnAppOpen(options);
  }
  return notificationPermissionFlow;
}

/** Aguarda o fluxo de notificação na abertura antes de pedir localização. */
export function waitForNotificationPermissionFlow(): Promise<boolean> {
  return startNotificationPermissionFlow();
}

function confirmNotificationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Notificações de entrega',
      'Ative para ser avisado quando a loja atribuir uma nova entrega ou cancelar uma rota. Você pode desativar depois nas configurações do celular.',
      [
        { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Ativar', style: 'default', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  // Android 13+ só exibe o prompt de POST_NOTIFICATIONS após existir um canal.
  await Notifications.setNotificationChannelAsync('deliveries', {
    name: 'Entregas',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FB5E13',
    sound: 'default',
  });
}

/**
 * Solicita permissão de notificação na abertura do app (antes do login).
 * Localização é pedida somente após autenticação.
 */
export async function requestNotificationPermissionOnAppOpen(options?: {
  skipPrePrompt?: boolean;
}): Promise<boolean> {
  if (!Device.isDevice) return false;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;

  if (existing.status === 'denied' && existing.canAskAgain === false) {
    return false;
  }

  if (declinedPrePromptThisSession && !options?.skipPrePrompt) {
    return false;
  }

  if (!options?.skipPrePrompt && !prePromptShownThisSession) {
    prePromptShownThisSession = true;
    const accepted = await confirmNotificationPermission();
    if (!accepted) {
      declinedPrePromptThisSession = true;
      return false;
    }
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return requested.status === 'granted';
}

async function getExpoPushTokenIfGranted(): Promise<string | null> {
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

/** Envia o token Expo para a API (requer login; permissão já concedida na abertura). */
export async function registerPushTokenWithApi(): Promise<boolean> {
  const token = await getExpoPushTokenIfGranted();
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

/** Pede notificação ao abrir o app; ao voltar ao foreground tenta de novo se ainda não concedida. */
export function useNotificationPermissionOnAppOpen() {
  useEffect(() => {
    void startNotificationPermissionFlow().catch(() => undefined);

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void requestNotificationPermissionOnAppOpen({ skipPrePrompt: true }).catch(() => undefined);
    });

    return () => sub.remove();
  }, []);
}

/** Escuta notificações e atualiza lista / deep link (após login). */
export function usePushNotifications(onRefresh: () => void | Promise<void>) {
  const router = useRouter();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
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
      received.remove();
      response.remove();
    };
  }, [router]);
}

/** Registra token na API após login e ao voltar ao app autenticado. */
export function useRegisterPushTokenWhenAuthenticated() {
  useEffect(() => {
    void registerPushTokenWithApi().catch(() => undefined);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void registerPushTokenWithApi().catch(() => undefined);
      }
    });

    return () => sub.remove();
  }, []);
}
