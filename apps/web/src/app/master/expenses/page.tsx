'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { ExpensesPanel } from '@/components/expenses/expenses-panel';
import { refreshStoredUser } from '@/lib/api';
import { canViewExpenses } from '@gas-erp/shared';

export default function MasterExpensesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // O layout master não filtra por papel; a API é a barreira real, mas evitamos
  // renderizar a tela para quem não pode vê-la.
  useEffect(() => {
    void refreshStoredUser().then((user) => {
      if (!user || !canViewExpenses(user.role)) {
        router.replace('/master/dashboard');
        setAllowed(false);
        return;
      }
      setAllowed(true);
    });
  }, [router]);

  if (allowed !== true) return <PageLoader label="Carregando gastos…" />;

  return <ExpensesPanel scope={{ mode: 'master' }} />;
}
