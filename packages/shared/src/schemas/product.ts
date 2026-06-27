import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  unit: z.string().optional(),
  productType: z.string().optional(),
  price: z.number().nonnegative().optional(),
  supplierCost: z.number().nonnegative().optional(),
  deliveryFee: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const updateProductPriceSchema = z.object({
  storeId: z.string(),
  price: z.number().nonnegative(),
  supplierCost: z.number().nonnegative().optional(),
  deliveryFee: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
