import { z } from 'zod';
import { DELIVERER_STATUSES } from '../enums';

export const createDelivererSchema = z.object({
  userId: z.string().min(1, 'Usuário obrigatório'),
  storeIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos uma unidade'),
  status: z.enum(DELIVERER_STATUSES).optional(),
});

export const updateDelivererSchema = z.object({
  storeIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos uma unidade').optional(),
  status: z.enum(DELIVERER_STATUSES).optional(),
});

export type CreateDelivererInput = z.infer<typeof createDelivererSchema>;
export type UpdateDelivererInput = z.infer<typeof updateDelivererSchema>;
