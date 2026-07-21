'use client';

import { useParams } from 'next/navigation';
import { PurchaseInvoiceForm } from '@/components/purchases/purchase-invoice-form';

export default function NewPurchasePage() {
  const { storeId } = useParams<{ storeId: string }>();

  return (
    <PurchaseInvoiceForm
      initialStoreId={storeId}
      backHref={`/store/${storeId}/purchases`}
    />
  );
}
