import { z } from 'zod';

export const createStoreSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(10),
  city: z.string().optional(),
  state: z.string().optional(),
  address: z.string().optional(),
  active: z.boolean().optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
