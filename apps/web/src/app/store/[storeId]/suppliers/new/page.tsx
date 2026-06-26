'use client';

import { useParams } from 'next/navigation';
import { SupplierForm } from '@/components/supplier-form';

export default function NewSupplierPage() {
  const { storeId } = useParams<{ storeId: string }>();
  return <SupplierForm storeId={storeId} />;
}
