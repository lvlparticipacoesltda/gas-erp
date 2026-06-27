'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SettingsContent } from '@/components/settings-content';
import { Card } from '@/components/ui';
import { getStoredUser } from '@/lib/api';
import { canManagePaymentMethods } from '@gas-erp/shared';

export default function StoreSettingsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const user = getStoredUser<{ role: string }>();
  const canManage = user ? canManagePaymentMethods(user.role) : false;

  return (
    <>
      {canManage && (
        <Card className="mb-6 border-brand/20 bg-brand/5">
          <h2 className="font-semibold">Formas de pagamento</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ative meios de pagamento, configure taxas da maquininha (% ou fixo) e cadastre formas customizadas.
          </p>
          <Link
            href={`/store/${storeId}/settings/payment-methods`}
            className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Configurar formas de pagamento
          </Link>
        </Card>
      )}
      <SettingsContent />
    </>
  );
}
