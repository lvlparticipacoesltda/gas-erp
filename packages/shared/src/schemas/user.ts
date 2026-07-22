import { z } from 'zod';
import { USER_ROLES } from '../enums';
import { userPermissionsSchema } from '../permissions';

/** Aceita máscara; persiste só dígitos. Vazio/null → null (permite limpar no update). */
const optionalDigits = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}, z.string().min(1).max(20).optional().nullable());

/** Data YYYY-MM-DD opcional; vazio → null. */
const optionalDateOnly = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable());

export const userHrFieldsSchema = z.object({
  cpf: optionalDigits,
  pis: optionalDigits,
  admittedAt: optionalDateOnly,
  jobTitle: z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return value;
  }, z.string().max(120).optional().nullable()),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(USER_ROLES),
  storeIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  permissions: userPermissionsSchema,
  ...userHrFieldsSchema.shape,
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: z.enum(USER_ROLES).optional(),
  storeIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  permissions: userPermissionsSchema,
  ...userHrFieldsSchema.shape,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;