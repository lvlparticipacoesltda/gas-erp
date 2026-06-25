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

export const pushNotificationDataSchema = z.object({
  type: z.enum(['NEW_DELIVERY', 'DELIVERY_CANCELLED']),
  deliveryId: z.string().min(1),
});

export type PushNotificationData = z.infer<typeof pushNotificationDataSchema>;
