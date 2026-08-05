'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { StoreResultsPanel } from '@/components/results/store-results-panel';
import { refreshStoredUser } from '@/lib/api';
import { canViewExpenses } from '@gas-erp/shared';

export default function MasterResultsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // O resultado expõe os custos diretos da empresa: mesmo portão do painel de gastos.
  // A API é a barreira real, isto só evita renderizar a tela para quem não pode vê-la.
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

  if (allowed !== true) return <PageLoader label="Carregando resultado…" />;

  return <StoreResultsPanel />;
}
