import { z } from 'zod';

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const createStoreSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(10),
  /** CNPJ da unidade (somente dígitos são persistidos); opcional. */
  cnpj: optionalTrimmed,
  /** Texto livre legado; opcional se campos estruturados forem enviados. */
  address: optionalTrimmed,
  street: optionalTrimmed,
  number: optionalTrimmed,
  complement: optionalTrimmed,
  neighborhood: optionalTrimmed,
  city: optionalTrimmed,
  state: z
    .string()
    .trim()
    .max(2)
    .optional()
    .transform((v) => (v === '' || v == null ? undefined : v.toUpperCase())),
  zipCode: optionalTrimmed,
  landmark: optionalTrimmed,
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  active: z.boolean().optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

/** Loja com endereço estruturado (lista do entregador / master). */
export const storeAddressSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().optional(),
  cnpj: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  landmark: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
});

export type StoreAddress = z.infer<typeof storeAddressSchema>;
