import { z } from 'zod';

export const createStockTransferSchema = z.object({
  fromStoreId: z.string(),
  toStoreId: z.string(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    }),
  ).min(1),
});

export const updateStockTransferStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'COMPLETED']),
});

export const adjustStockSchema = z.object({
  productId: z.string(),
  storeId: z.string(),
  quantity: z.number().int(),
  reason: z.string().min(3),
});

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
