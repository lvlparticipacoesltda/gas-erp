import { z } from 'zod';

export const customerAddressSchema = z.object({
  label: z.string().optional(),
  street: z.string().min(1),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zipCode: z.string().optional(),
  landmark: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const createCustomerSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  document: z.string().optional(),
  notes: z.string().optional(),
  categoryId: z.string().optional(),
  addresses: z.array(customerAddressSchema).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
