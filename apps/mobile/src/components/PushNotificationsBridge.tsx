import { useDeliveriesContext } from '@/lib/deliveries-context';
import { usePushNotifications } from '@/lib/notifications';

/** Conecta push notifications ao cache de entregas. */
export function PushNotificationsBridge() {
  const { refresh } = useDeliveriesContext();
  usePushNotifications(refresh);
  return null;
}
