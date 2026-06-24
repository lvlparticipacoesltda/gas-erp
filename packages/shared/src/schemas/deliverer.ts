import { z } from 'zod';
import { DELIVERER_STATUSES } from '../enums';

export const createDelivererSchema = z.object({
  userId: z.string(),
  storeId: z.string(),
  status: z.enum(DELIVERER_STATUSES).optional(),
});

export const updateDelivererSchema = z.object({
  storeId: z.string().optional(),
  status: z.enum(DELIVERER_STATUSES).optional(),
});

export type CreateDelivererInput = z.infer<typeof createDelivererSchema>;
