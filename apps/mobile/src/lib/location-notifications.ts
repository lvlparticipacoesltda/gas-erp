import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { LOCATION_TASK } from './location-constants';

/** Nome do canal Android do Foreground Service de GPS (separado dos pushes de entrega). */
export const LOCATION_TRACKING_CHANNEL_NAME = 'Rastreamento de localização';

/**
 * O expo-location usa `{appScopeKey}:{taskName}` como channelId no Android.
 * Pré-criar o canal garante nome/descrição corretos antes do serviço iniciar.
 */
export function getLocationForegroundServiceChannelId(): string {
  const owner = Constants.expoConfig?.owner;
  const slug = Constants.expoConfig?.slug;
  const scope = owner && slug ? `@${owner}/${slug}` : (slug ?? 'gas-entregador');
  return `${scope}:${LOCATION_TASK}`;
}

let locationChannelReady = false;

/** Canal silencioso e persistente — não mistura com pushes de nova rota. */
export async function ensureLocationTrackingNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android' || locationChannelReady) return;

  const channelId = getLocationForegroundServiceChannelId();
  await Notifications.setNotificationChannelAsync(channelId, {
    name: LOCATION_TRACKING_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.LOW,
    description:
      'Mantém sua posição no mapa da loja enquanto você estiver disponível ou em rota. Não desligue.',
    sound: undefined,
    enableVibrate: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });

  locationChannelReady = true;
}
