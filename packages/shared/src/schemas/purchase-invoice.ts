import { z } from 'zod';

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');

export const purchaseInvoiceItemSchema = z.object({
  productId: z.string().min(1, 'Produto obrigatório'),
  quantity: z.number().int().positive('Quantidade deve ser maior que zero'),
  unitPrice: z.number().nonnegative('Valor unitário inválido'),
  discount: z.number().nonnegative().optional(),
  paymentDate: dateKey.optional(),
});

export const purchaseInvoicePaymentSchema = z.object({
  /**
   * Categoria > Subcategoria. Texto livre validado contra
   * PURCHASE_PAYMENT_CATEGORIES no cliente. Mantido como string aqui para
   * permitir migração futura para FK quando o módulo Financeiro existir, sem
   * quebrar dados já gravados.
   */
  category: z.string().min(1, 'Categoria obrigatória'),
  dueDate: dateKey,
  amount: z.number().nonnegative('Valor inválido'),
  installment: z.number().int().positive().optional(),
});

export const createPurchaseInvoiceSchema = z.object({
  storeId: z.string().min(1),
  supplierId: z.string().min(1, 'Fornecedor obrigatório'),
  number: z.string().min(1, 'Número da nota obrigatório'),
  issueDate: dateKey,
  notes: z.string().optional(),
  items: z.array(purchaseInvoiceItemSchema).min(1, 'Adicione ao menos um item'),
  payments: z.array(purchaseInvoicePaymentSchema).optional(),
});

export const updatePurchaseInvoiceSchema = z.object({
  number: z.string().min(1).optional(),
  issueDate: dateKey.optional(),
  supplierId: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export const importPurchaseInvoiceSchema = z.object({
  storeId: z.string().min(1),
  /** Chave de acesso da NF-e ou XML bruto. */
  accessKey: z.string().optional(),
  xml: z.string().optional(),
});

export type CreatePurchaseInvoiceInput = z.infer<typeof createPurchaseInvoiceSchema>;
export type UpdatePurchaseInvoiceInput = z.infer<typeof updatePurchaseInvoiceSchema>;
export type ImportPurchaseInvoiceInput = z.infer<typeof importPurchaseInvoiceSchema>;
