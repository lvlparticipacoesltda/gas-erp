import { Alert } from 'react-native';
import { startDeliveryRoute } from './start-delivery-route';
import { startDeliveryTracking } from './location';
import type { Delivery } from '../types';

/** Foca a navegação em outra entrega — inicia rota nova ou troca o GPS para uma já em andamento. */
export async function focusDeliveryRoute(delivery: Delivery): Promise<void> {
  if (delivery.status === 'IN_PROGRESS') {
    const permissions = await startDeliveryTracking(delivery.id);
    if (!permissions.foreground) {
      Alert.alert(
        'Localização',
        'Rota alterada. Permita o acesso à localização nas configurações para compartilhar o trajeto.',
      );
    }
    return;
  }

  await startDeliveryRoute(delivery);
}
