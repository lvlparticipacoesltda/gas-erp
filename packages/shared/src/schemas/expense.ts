import { z } from 'zod';
import { optionalId } from './helpers';

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');

const optionalDateKey = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  dateKey.optional(),
);

const optionalText = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().optional(),
);

export const EXPENSE_STATUSES = ['PENDING', 'PAID', 'CANCELLED'] as const;
export type ExpenseStatusValue = (typeof EXPENSE_STATUSES)[number];

export const createExpenseSchema = z
  .object({
    /** Ausente/vazio = despesa da organização (rateada entre as unidades). */
    storeId: optionalId,
    categoryId: z.string().min(1, 'Categoria obrigatória'),
    description: z.string().min(1, 'Descrição obrigatória'),
    /** Competência: define o mês em que o gasto afeta o resultado. */
    expenseDate: dateKey,
    dueDate: optionalDateKey,
    paidAt: optionalDateKey,
    amount: z.number().positive('Valor deve ser maior que zero'),
    status: z.enum(EXPENSE_STATUSES).optional(),
    supplierId: optionalId,
    supplierName: optionalText,
    paymentLabel: optionalText,
    notes: optionalText,
    /** > 1 gera uma linha por parcela, uma a cada mês a partir da competência. */
    installments: z.number().int().min(1).max(60).optional(),
  })
  .refine((data) => data.status !== 'PAID' || Boolean(data.paidAt), {
    message: 'Informe a data do pagamento',
    path: ['paidAt'],
  });

export const updateExpenseSchema = z.object({
  storeId: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().min(1).nullable().optional(),
  ),
  categoryId: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  expenseDate: dateKey.optional(),
  dueDate: z.preprocess(
    (value) => (value === '' ? null : value),
    dateKey.nullable().optional(),
  ),
  paidAt: z.preprocess(
    (value) => (value === '' ? null : value),
    dateKey.nullable().optional(),
  ),
  amount: z.number().positive().optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  supplierId: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().min(1).nullable().optional(),
  ),
  supplierName: z.preprocess((value) => (value === '' ? null : value), z.string().nullable().optional()),
  paymentLabel: z.preprocess((value) => (value === '' ? null : value), z.string().nullable().optional()),
  notes: z.preprocess((value) => (value === '' ? null : value), z.string().nullable().optional()),
});

export const payExpenseSchema = z.object({
  paidAt: optionalDateKey,
  paymentLabel: optionalText,
});

export const expenseFiltersSchema = z.object({
  /** `org` filtra apenas despesas sem unidade. */
  storeId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  dateFrom: optionalDateKey,
  dateTo: optionalDateKey,
  search: z.string().optional(),
});

export const createExpenseCategorySchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  icon: optionalText,
  color: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #rrggbb)')
      .optional(),
  ),
  sortOrder: z.number().int().optional(),
});

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type PayExpenseInput = z.infer<typeof payExpenseSchema>;
export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

/** Query `storeId=org` → apenas despesas da organização (sem unidade). */
export const EXPENSE_STORE_FILTER_ORG = 'org';
