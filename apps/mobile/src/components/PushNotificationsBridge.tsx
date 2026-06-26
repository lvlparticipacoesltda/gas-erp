import { useDeliveriesContext } from '@/lib/deliveries-context';
import { usePushNotifications, useRegisterPushTokenWhenAuthenticated } from '@/lib/notifications';
import { useDelivererAvailability } from '@/lib/deliverer-availability-context';

/** Conecta push notifications ao cache de entregas (após login). */
export function PushNotificationsBridge() {
  const { refresh } = useDeliveriesContext();
  const { refresh: refreshAvailability } = useDelivererAvailability();

  useRegisterPushTokenWhenAuthenticated();
  usePushNotifications(async () => {
    await refresh();
    await refreshAvailability();
  });

  return null;
}
