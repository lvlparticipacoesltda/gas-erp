import { z } from 'zod';

export const upsertCustomerProductPriceSchema = z.object({
  productId: z.string().min(1),
  price: z.number().nonnegative(),
});

export const setCustomerProductPricesSchema = z.object({
  items: z.array(upsertCustomerProductPriceSchema),
});

export type UpsertCustomerProductPriceInput = z.infer<typeof upsertCustomerProductPriceSchema>;

export interface CustomerProductPriceRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  storeId: string;
  price: number;
  defaultStorePrice: number | null;
}
