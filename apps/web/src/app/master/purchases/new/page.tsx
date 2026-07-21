'use client';

import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { PurchaseInvoiceForm } from '@/components/purchases/purchase-invoice-form';
import { api, getToken } from '@/lib/api';

interface StoreOption {
  id: string;
  name: string;
}

export default function MasterNewPurchasePage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<StoreOption[]>('/stores', {}, getToken())
      .then((res) => setStores(res))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <PurchaseInvoiceForm
      showStorePicker
      stores={stores}
      title="Lançar nota de compra"
      backHref="/master/purchases"
    />
  );
}
