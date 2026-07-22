'use client';

import { useParams, useRouter } from 'next/navigation';
import { SaleReceiptContent } from '@/components/sale-receipt-drawer';

export default function SaleReceiptPage() {
  const { storeId, saleId } = useParams<{ storeId: string; saleId: string }>();
  const router = useRouter();

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(`/store/${storeId}/sales`);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-6">
      <button
        type="button"
        onClick={handleBack}
        className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Voltar
      </button>
      <SaleReceiptContent storeId={storeId} saleId={saleId} />
    </div>
  );
}
