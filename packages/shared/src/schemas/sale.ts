import { z } from 'zod';
import { FULFILLMENT_TYPES, PAYMENT_METHODS, SALE_CHANNELS } from '../enums';
import { getPaymentSumErrorMessage } from '../payment-sum-hint';
import { optionalId } from './helpers';

export const saleItemSchema = z.object({
  productId: z.string().min(1, 'Produto obrigatório'),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
});

export const salePaymentSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS).optional(),
    storePaymentMethodId: z.string().min(1).optional(),
    amount: z.number().nonnegative(),
  })
  .refine((data) => Boolean(data.method || data.storePaymentMethodId), {
    message: 'Informe a forma de pagamento.',
  });

const PAYMENT_SUM_TOLERANCE = 0.009;

/** Valida soma dos pagamentos contra o total da venda (uso na API). */
export function assertSalePaymentsTotal(
  payments: { amount: number }[],
  saleTotal: number,
): void {
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  if (saleTotal > 0 && Math.abs(paid - saleTotal) > PAYMENT_SUM_TOLERANCE) {
    throw new Error(getPaymentSumErrorMessage(paid, saleTotal));
  }
}

export const createSaleSchema = z.object({
  storeId: z.string(),
  customerId: optionalId,
  channel: z.enum(SALE_CHANNELS).optional(),
  notes: z.string().optional(),
  delivererId: optionalId,
  deliveryStreet: z.string().optional(),
  deliveryNumber: z.string().optional(),
  deliveryComplement: z.string().optional(),
  deliveryNeighborhood: z.string().optional(),
  deliveryCity: z.string().optional(),
  deliveryState: z.string().optional(),
  deliveryLandmark: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
  payments: z.array(salePaymentSchema).optional(),
  fulfillmentType: z.enum(FULFILLMENT_TYPES).optional(),
  gasDoPovoBenefit: z.boolean().optional(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  backdateRequestNotes: z.string().optional(),
}).superRefine((data, ctx) => {
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
});

export const updateSalePaymentsSchema = z.object({
  payments: z.array(salePaymentSchema).min(1, 'Informe ao menos uma forma de pagamento'),
  /** Ajuste de preço unitário — permitido apenas com benefício Gás do Povo (validado na API). */
  unitPrice: z.number().nonnegative().optional(),
});

export type UpdateSalePaymentsInput = z.infer<typeof updateSalePaymentsSchema>;

export const rejectSaleBackdateSchema = z.object({
  reason: z.string().min(3, 'Informe o motivo da rejeição'),
});

export const updateSaleStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'IN_DELIVERY', 'DELIVERED', 'CANCELLED']),
  delivererId: z.string().optional(),
  canceledReason: z.string().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
