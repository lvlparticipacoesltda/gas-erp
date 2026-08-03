export interface ExpenseCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  system: boolean;
  sortOrder: number;
  active: boolean;
}

export interface Expense {
  id: string;
  description: string;
  expenseDate: string;
  dueDate: string | null;
  paidAt: string | null;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  paymentLabel: string | null;
  notes: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierLabel: string | null;
  installment: number | null;
  installments: number | null;
  category: { id: string; name: string; icon: string | null; color: string | null };
  store: { id: string; name: string; code: string } | null;
}

export interface ExpenseSummary {
  total: number;
  paid: number;
  pending: number;
  cancelled: number;
  count: number;
  byCategory: {
    categoryId: string;
    name: string;
    icon: string | null;
    color: string | null;
    total: number;
    count: number;
  }[];
  byStore: { storeId: string | null; name: string; total: number; count: number }[];
  byMonth: { month: string; total: number }[];
}

export interface StoreOption {
  id: string;
  name: string;
}

/** `master` mostra todas as unidades e permite filtrar; `store` fixa a unidade. */
export type ExpenseScope = { mode: 'master' } | { mode: 'store'; storeId: string };
