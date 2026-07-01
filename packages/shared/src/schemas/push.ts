import { z } from 'zod';

/** Token Expo Push (ExponentPushToken[...]). */
export const registerPushTokenSchema = z.object({
  token: z
    .string()
    .min(1, 'Token obrigatório')
    .refine((v) => v.startsWith('ExponentPushToken[') && v.endsWith(']'), {
      message: 'Token Expo Push inválido',
    }),
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

/** Canal Android para pushes de rota com som customizado. */
export const DELIVERY_PUSH_CHANNEL_ID = 'deliveries-route';

/** Canal Android para pushes informativos (som padrão do sistema). */
export const DELIVERY_PUSH_DEFAULT_CHANNEL_ID = 'deliveries';

/** Arquivo em `apps/mobile/assets/sounds/` registrado no plugin expo-notifications. */
export const DELIVERY_PUSH_SOUND = 'rota_entrega.wav';

export const pushNotificationDataSchema = z.object({
  type: z.enum([
    'NEW_DELIVERY',
    'DELIVERY_CANCELLED',
    'PENDING_DELIVERY_REMINDER',
    'GPS_STALE',
  ]),
  deliveryId: z.string().min(1).optional(),
});

export type PushNotificationData = z.infer<typeof pushNotificationDataSchema>;
