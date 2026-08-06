import { z } from 'zod';
import { optionalId } from './helpers';
import { normalizePhoneForStorage } from '../phone';

const optionalText = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().optional(),
);

export const createVasilhameLoanSchema = z.object({
  storeId: z.string().min(1, 'Unidade obrigatória'),
  /** Cliente cadastrado; ausente em empréstimos avulsos (comércio sem cadastro). */
  customerId: optionalId,
  responsibleName: z.string().min(2, 'Informe o responsável'),
  responsiblePhone: z
    .string()
    .optional()
    .transform((value) => normalizePhoneForStorage(value)),
  street: z.string().min(1, 'Informe a rua'),
  number: optionalText,
  complement: optionalText,
  neighborhood: optionalText,
  city: z.string().min(1, 'Informe a cidade'),
  state: z.string().length(2, 'UF deve ter 2 letras'),
  zipCode: optionalText,
  landmark: optionalText,
  quantity: z
    .number()
    .int('Quantidade deve ser um número inteiro')
    .positive('Quantidade deve ser maior que zero'),
  notes: optionalText,
});

export const updateVasilhameLoanSchema = createVasilhameLoanSchema
  .partial()
  .omit({ storeId: true })
  .extend({
    /** Permite desvincular o cliente sem apagar o empréstimo. */
    customerId: z.preprocess(
      (value) => (value === '' ? null : value),
      z.string().min(1).nullable().optional(),
    ),
  });

export const vasilhameLoanFiltersSchema = z.object({
  storeId: z.string().min(1, 'Unidade obrigatória'),
  search: optionalText,
});

export type CreateVasilhameLoanInput = z.infer<typeof createVasilhameLoanSchema>;
export type UpdateVasilhameLoanInput = z.infer<typeof updateVasilhameLoanSchema>;
export type VasilhameLoanFilters = z.infer<typeof vasilhameLoanFiltersSchema>;
