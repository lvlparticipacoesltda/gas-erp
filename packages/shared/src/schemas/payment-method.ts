import { z } from 'zod';
import { PAYMENT_FEE_MODES } from '../enums';

export const paymentFeeModeSchema = z.enum(PAYMENT_FEE_MODES);
export type PaymentFeeModeValue = z.infer<typeof paymentFeeModeSchema>;

export const storePaymentMethodSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  organizationId: z.string(),
  systemCode: z.string().nullable(),
  label: z.string(),
  isCustom: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number(),
  feeMode: paymentFeeModeSchema,
  feePercent: z.number(),
  feeFixed: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createStorePaymentMethodSchema = z.object({
  label: z.string().min(2, 'Informe um nome').max(80),
  feeMode: paymentFeeModeSchema.default('NONE'),
  feePercent: z.number().min(0).max(100).default(0),
  feeFixed: z.number().min(0).default(0),
  enabled: z.boolean().default(true),
});

export const updateStorePaymentMethodSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  feeMode: paymentFeeModeSchema.optional(),
  feePercent: z.number().min(0).max(100).optional(),
  feeFixed: z.number().min(0).optional(),
});

export type CreateStorePaymentMethodInput = z.infer<typeof createStorePaymentMethodSchema>;
export type UpdateStorePaymentMethodInput = z.infer<typeof updateStorePaymentMethodSchema>;
