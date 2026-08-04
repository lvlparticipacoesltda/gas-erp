'use client';

import { Alert } from '@/components/ui';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { SupplierForm, emptySupplierForm, type SupplierFormValues } from '@/components/supplier-form';
import { api, getToken } from '@/lib/api';

interface SupplierResponse {
  id: string;
  type: string;
  legalName: string;
  tradeName?: string | null;
  stateRegistration?: string | null;
  document?: string | null;
  city?: string | null;
  state?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  number?: string | null;
  complement?: string | null;
  landmark?: string | null;
  zipCode?: string | null;
  email?: string | null;
  notes?: string | null;
  rntrc?: string | null;
  phone?: string | null;
  finalConsumer?: boolean;
  publicAgency?: boolean;
}

function toForm(s: SupplierResponse): SupplierFormValues {
  return {
    type: s.type ?? 'PJ',
    tradeName: s.tradeName ?? '',
    legalName: s.legalName ?? '',
    stateRegistration: s.stateRegistration ?? '',
    document: s.document ?? '',
    city: s.city ?? '',
    state: s.state ?? '',
    street: s.street ?? '',
    neighborhood: s.neighborhood ?? '',
    number: s.number ?? '',
    complement: s.complement ?? '',
    landmark: s.landmark ?? '',
    zipCode: s.zipCode ?? '',
    email: s.email ?? '',
    notes: s.notes ?? '',
    rntrc: s.rntrc ?? '',
    phone: s.phone ?? '',
    finalConsumer: s.finalConsumer ?? false,
    publicAgency: s.publicAgency ?? false,
  };
}

export default function EditSupplierPage() {
  const { storeId, id } = useParams<{ storeId: string; id: string }>();
  const [values, setValues] = useState<SupplierFormValues | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<SupplierResponse>(`/suppliers/${id}`, {}, getToken())
      .then((res) => {
        if (!cancelled) setValues(toForm(res));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar fornecedor');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <Alert>{error}</Alert>;
  }

  if (!values) {
    return <PageLoader />;
  }

  return <SupplierForm storeId={storeId} supplierId={id} initialValues={values ?? emptySupplierForm} />;
}
