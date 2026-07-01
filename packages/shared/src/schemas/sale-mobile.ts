import { z } from 'zod';
import { FULFILLMENT_TYPES } from '../enums';
import { optionalId } from './helpers';
import { saleItemSchema, salePaymentSchema } from './sale';

export const createMobileSaleSchema = z
  .object({
    storeId: z.string().min(1, 'Loja obrigatória'),
    customerId: optionalId,
    fulfillmentType: z.enum(FULFILLMENT_TYPES).default('DELIVERY'),
    notes: z.string().optional(),
    items: z.array(saleItemSchema).min(1, 'Informe ao menos um produto'),
    payments: z.array(salePaymentSchema).optional(),
    gasDoPovoBenefit: z.boolean().optional(),
    deliveryStreet: z.string().optional(),
    deliveryNumber: z.string().optional(),
    deliveryComplement: z.string().optional(),
    deliveryNeighborhood: z.string().optional(),
    deliveryCity: z.string().optional(),
    deliveryState: z.string().optional(),
    deliveryLandmark: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const benefit = data.gasDoPovoBenefit ?? false;
    const payments = data.payments ?? [];
    if (benefit && payments.some((p) => p.method && p.method !== 'GDP')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Com benefício Gás do Povo, o pagamento deve ser GDP.',
        path: ['payments'],
      });
    }
    if (!benefit && payments.some((p) => p.method === 'GDP')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GDP só é permitido quando o benefício Gás do Povo está ativo.',
        path: ['payments'],
      });
    }
    if (data.fulfillmentType === 'DELIVERY') {
      const hasAddress = data.deliveryStreet?.trim() || data.deliveryCity?.trim();
      if (!hasAddress) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe o endereço de entrega.',
          path: ['deliveryStreet'],
        });
      }
    }
  });

export const rejectSaleMobileSchema = z.object({
  reason: z.string().min(3, 'Informe o motivo da rejeição'),
});

export type CreateMobileSaleInput = z.infer<typeof createMobileSaleSchema>;
