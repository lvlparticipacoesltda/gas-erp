import { z } from 'zod';
import { FULFILLMENT_TYPES, PAYMENT_METHODS, SALE_CHANNELS } from '../enums';
import { getPaymentSumErrorMessage } from '../payment-sum-hint';
import { anyItemHasPaymentMethod, allItemsHavePaymentMethod } from '../sale-item-payments';
import { optionalId } from './helpers';

export const saleItemSchema = z.object({
  productId: z.string().min(1, 'Produto obrigatório'),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
  /** Forma de pagamento deste produto (opcional). */
  storePaymentMethodId: z.string().min(1).optional().nullable(),
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
  /** Preferência legada / atalho: se true e sem formas nos itens, força 100% GDP. */
  gasDoPovoBenefit: z.boolean().optional(),
  /** Forma da taxa de entrega quando o pagamento é por produto. */
  deliveryFeeStorePaymentMethodId: z.string().min(1).optional().nullable(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  backdateRequestNotes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (anyItemHasPaymentMethod(data.items) && !allItemsHavePaymentMethod(data.items)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Defina a forma de pagamento em todos os produtos.',
      path: ['items'],
    });
  }
});

export const updateSaleItemPaymentSchema = z.object({
  id: z.string().min(1),
  storePaymentMethodId: z.string().min(1),
});

export const updateSalePaymentsSchema = z.object({
  payments: z.array(salePaymentSchema).optional(),
  /** Atualiza forma de pagamento por item; quando enviado, os pagamentos são recalculados. */
  itemPayments: z.array(updateSaleItemPaymentSchema).optional(),
  deliveryFeeStorePaymentMethodId: z.string().min(1).optional().nullable(),
  /** Ajuste de preço unitário — permitido apenas com benefício Gás do Povo (validado na API). */
  unitPrice: z.number().nonnegative().optional(),
}).superRefine((data, ctx) => {
  if (!data.payments?.length && !data.itemPayments?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe pagamentos ou formas por produto.',
      path: ['payments'],
    });
  }
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
