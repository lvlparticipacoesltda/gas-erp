'use client';

import { useParams } from 'next/navigation';
import { ExpensesPanel } from '@/components/expenses/expenses-panel';

export default function StoreExpensesPage() {
  const params = useParams();
  const storeId = params.storeId as string;

  // O guard de papel fica no layout da loja (canAccessStoreNavItem).
  return <ExpensesPanel scope={{ mode: 'store', storeId }} />;
}
