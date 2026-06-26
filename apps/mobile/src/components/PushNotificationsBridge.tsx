import { useDeliveriesContext } from '@/lib/deliveries-context';
import { usePushNotifications } from '@/lib/notifications';
import { useDelivererAvailability } from '@/lib/deliverer-availability-context';

/** Conecta push notifications ao cache de entregas. */
export function PushNotificationsBridge() {
  const { refresh } = useDeliveriesContext();
  const { refresh: refreshAvailability } = useDelivererAvailability();
  usePushNotifications(async () => {
    await refresh();
    await refreshAvailability();
  });
  return null;
}
