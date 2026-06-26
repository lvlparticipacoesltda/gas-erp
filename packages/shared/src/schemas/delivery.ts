import { z } from 'zod';

export const deliveryTrackingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  recordedAt: z.string().datetime().optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  batteryCharging: z.boolean().optional(),
});

export const updateDeliveryStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'DELIVERED', 'CANCELLED']),
});

export type DeliveryTrackingInput = z.infer<typeof deliveryTrackingSchema>;
