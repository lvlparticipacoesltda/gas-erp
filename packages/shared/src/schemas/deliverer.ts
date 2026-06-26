import { z } from 'zod';
import { DELIVERER_STATUSES } from '../enums';

export const createDelivererSchema = z
  .object({
    userId: z.string().min(1).optional(),
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    password: z.string().min(6).optional(),
    storeIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos uma unidade'),
    status: z.enum(DELIVERER_STATUSES).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.userId) return;
    if (!data.name) {
      ctx.addIssue({ code: 'custom', message: 'Nome obrigatório', path: ['name'] });
    }
    if (!data.email) {
      ctx.addIssue({ code: 'custom', message: 'E-mail obrigatório', path: ['email'] });
    }
    if (!data.password) {
      ctx.addIssue({ code: 'custom', message: 'Senha obrigatória', path: ['password'] });
    }
  });

export const updateDelivererSchema = z.object({
  storeIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos uma unidade').optional(),
  status: z.enum(DELIVERER_STATUSES).optional(),
});

export type CreateDelivererInput = z.infer<typeof createDelivererSchema>;
export type UpdateDelivererInput = z.infer<typeof updateDelivererSchema>;

export const delivererPositionStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const delivererPositionSchema = z.object({
  delivererId: z.string(),
  name: z.string(),
  delivererStatus: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  updatedAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  stale: z.boolean(),
  deliveryId: z.string().nullable().optional(),
  deliveryStatus: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  stores: z.array(delivererPositionStoreSchema),
});

export const delivererPositionsResponseSchema = z.array(delivererPositionSchema);

export type DelivererPosition = z.infer<typeof delivererPositionSchema>;
export type DelivererPositionsResponse = z.infer<typeof delivererPositionsResponseSchema>;

/** Posição considerada desatualizada após este intervalo (ms). */
export const DELIVERER_POSITION_STALE_MS = 5 * 60 * 1000;
