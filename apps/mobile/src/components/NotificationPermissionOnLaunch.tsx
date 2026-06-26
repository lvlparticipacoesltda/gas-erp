import { useNotificationPermissionOnAppOpen } from '@/lib/notifications';

/** Solicita permissão de notificação na abertura do app (antes do login). */
export function NotificationPermissionOnLaunch() {
  useNotificationPermissionOnAppOpen();
  return null;
}
