import { Alert } from 'react-native';
import { updateDeliveryStatus } from './deliveries';
import { startDeliveryTracking, stopDeliveryTracking } from './location';
import type { Delivery } from '../types';

/** Inicia rota no servidor e ativa GPS — sem abrir app externo de mapas. */
export async function startDeliveryRoute(delivery: Delivery): Promise<void> {
  await updateDeliveryStatus(delivery.id, 'IN_PROGRESS');

  try {
    const permissions = await startDeliveryTracking(delivery.id);
    if (!permissions.foreground) {
      Alert.alert(
        'Localização',
        'Rota iniciada. Permita o acesso à localização nas configurações para compartilhar o trajeto.',
      );
    } else if (!permissions.background) {
      Alert.alert(
        'Localização em segundo plano',
        'Rota iniciada. Para rastrear com o app fechado, permita localização "o tempo todo" nas configurações.',
      );
    }
  } catch {
    Alert.alert(
      'GPS indisponível',
      'A rota foi iniciada, mas não foi possível ativar o rastreamento GPS neste dispositivo.',
    );
  }
}

export async function cancelDeliveryRouteOnError(): Promise<void> {
  await stopDeliveryTracking().catch(() => undefined);
}
