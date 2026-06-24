import { z } from 'zod';
import { USER_ROLES } from '../enums';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(USER_ROLES),
  storeIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: z.enum(USER_ROLES).optional(),
  storeIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
