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

export const assignDeliveryDelivererSchema = z.object({
  delivererId: z.string().min(1),
});

export type DeliveryTrackingInput = z.infer<typeof deliveryTrackingSchema>;
export type AssignDeliveryDelivererInput = z.infer<typeof assignDeliveryDelivererSchema>;

export const deliveryDestinationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const deliveryRouteQuerySchema = z.object({
  originLat: z.coerce.number().min(-90).max(90),
  originLng: z.coerce.number().min(-180).max(180),
});

export const deliveryRouteBoundsSchema = z.object({
  northeast: deliveryDestinationSchema,
  southwest: deliveryDestinationSchema,
});

export const deliveryRouteStepSchema = z.object({
  instruction: z.string(),
  distanceMeters: z.number(),
  maneuver: z.string().optional(),
  startLocation: deliveryDestinationSchema,
  endLocation: deliveryDestinationSchema,
});

export const deliveryRouteResponseSchema = z.object({
  encodedPolyline: z.string(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  bounds: deliveryRouteBoundsSchema,
  steps: z.array(deliveryRouteStepSchema).optional(),
  /** Destino resolvido pelo Directions (útil para alinhar lat/lng da loja ao endereço). */
  destination: deliveryDestinationSchema.optional(),
});

export type DeliveryDestination = z.infer<typeof deliveryDestinationSchema>;
export type DeliveryRouteQuery = z.infer<typeof deliveryRouteQuerySchema>;
export type DeliveryRouteStep = z.infer<typeof deliveryRouteStepSchema>;
export type DeliveryRouteResponse = z.infer<typeof deliveryRouteResponseSchema>;
