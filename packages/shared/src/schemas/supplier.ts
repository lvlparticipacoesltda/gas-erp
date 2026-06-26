import { z } from 'zod';
import { SUPPLIER_TYPES } from '../enums';

export const createSupplierSchema = z.object({
  type: z.enum(SUPPLIER_TYPES).optional(),
  legalName: z.string().min(2),
  tradeName: z.string().optional(),
  document: z.string().optional(),
  stateRegistration: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  rntrc: z.string().optional(),
  zipCode: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional().or(z.literal('')),
  landmark: z.string().optional(),
  notes: z.string().optional(),
  finalConsumer: z.boolean().optional(),
  publicAgency: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
