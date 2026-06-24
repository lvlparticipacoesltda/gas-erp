import { z } from 'zod';

/** Converte string vazia em undefined — evita FK inválida no Prisma. */
export const optionalId = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.string().min(1).optional(),
);
