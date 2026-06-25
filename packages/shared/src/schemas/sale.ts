import { z } from 'zod';
import { FULFILLMENT_TYPES, PAYMENT_METHODS, SALE_CHANNELS } from '../enums';
import { optionalId } from './helpers';

export const saleItemSchema = z.object({
  productId: z.string().min(1, 'Produto obrigatório'),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
});

export const salePaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().nonnegative(),
});

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
});

export const updateSaleStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'IN_DELIVERY', 'DELIVERED', 'CANCELLED']),
  delivererId: z.string().optional(),
  canceledReason: z.string().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
