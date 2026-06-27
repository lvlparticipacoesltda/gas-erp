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
        <Card className="mb-6">
          <h2 className="font-semibold">Configurações da loja</h2>
          <p className="mt-1 text-sm text-slate-600">Taxas de cartão, PIX e formas de pagamento customizadas.</p>
          <Link
            href={`/store/${storeId}/settings/payment-methods`}
            className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
          >
            Formas de pagamento →
          </Link>
        </Card>
      )}
      <SettingsContent />
    </>
  );
}
