'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { SUPPLIER_TYPES, SUPPLIER_TYPE_LABELS } from '@gas-erp/shared';

export interface SupplierFormValues {
  type: string;
  tradeName: string;
  legalName: string;
  stateRegistration: string;
  document: string;
  city: string;
  state: string;
  street: string;
  neighborhood: string;
  number: string;
  complement: string;
  landmark: string;
  zipCode: string;
  email: string;
  notes: string;
  rntrc: string;
  phone: string;
  finalConsumer: boolean;
  publicAgency: boolean;
}

export const emptySupplierForm: SupplierFormValues = {
  type: 'PJ',
  tradeName: '',
  legalName: '',
  stateRegistration: '',
  document: '',
  city: '',
  state: 'SP',
  street: '',
  neighborhood: '',
  number: '',
  complement: '',
  landmark: '',
  zipCode: '',
  email: '',
  notes: '',
  rntrc: '',
  phone: '',
  finalConsumer: false,
  publicAgency: false,
};

export function SupplierForm({
  storeId,
  supplierId,
  initialValues,
}: {
  storeId: string;
  supplierId?: string;
  initialValues?: SupplierFormValues;
}) {
  const router = useRouter();
  const [form, setForm] = useState<SupplierFormValues>(initialValues ?? emptySupplierForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(supplierId);
  const backHref = `/store/${storeId}/suppliers`;

  function set<K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        legalName: form.legalName,
        tradeName: form.tradeName,
        stateRegistration: form.stateRegistration,
        document: form.document,
        city: form.city,
        state: form.state.toUpperCase(),
        street: form.street,
        neighborhood: form.neighborhood,
        number: form.number,
        complement: form.complement,
        landmark: form.landmark,
        zipCode: form.zipCode,
        email: form.email,
        notes: form.notes,
        rntrc: form.rntrc,
        phone: form.phone,
        finalConsumer: form.finalConsumer,
        publicAgency: form.publicAgency,
      };
      if (isEditing) {
        await api(`/suppliers/${supplierId}`, { method: 'PATCH', body: JSON.stringify(payload) }, getToken());
      } else {
        await api('/suppliers', { method: 'POST', body: JSON.stringify(payload) }, getToken());
      }
      router.push(backHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar fornecedor');
      setSaving(false);
    }
  }

  const documentLabel = form.type === 'PF' ? 'CPF' : 'CNPJ';

  return (
    <>
      <PageHeader
        title={isEditing ? 'Editar fornecedor' : 'Cadastrar fornecedor'}
        action={
          <Button type="button" variant="secondary" onClick={() => router.push(backHref)}>
            Voltar
          </Button>
        }
      />

      <Card>
        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
                {SUPPLIER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SUPPLIER_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Título do estabelecimento (Nome Fantasia)</Label>
              <Input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} />
            </div>
            <div>
              <Label>Nome empresarial (Razão Social)</Label>
              <Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} required />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Inscrição Estadual</Label>
              <Input value={form.stateRegistration} onChange={(e) => set('stateRegistration', e.target.value)} />
            </div>
            <div>
              <Label>{documentLabel}</Label>
              <Input value={form.document} onChange={(e) => set('document', e.target.value)} />
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <div>
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Santos" />
              </div>
              <div>
                <Label>UF</Label>
                <Input
                  value={form.state}
                  onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                  placeholder="SP"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Logradouro</Label>
              <Input value={form.street} onChange={(e) => set('street', e.target.value)} />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
            </div>
            <div>
              <Label>Número</Label>
              <Input value={form.number} onChange={(e) => set('number', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Complemento</Label>
              <Input value={form.complement} onChange={(e) => set('complement', e.target.value)} />
            </div>
            <div>
              <Label>Ponto de referência</Label>
              <Input value={form.landmark} onChange={(e) => set('landmark', e.target.value)} />
            </div>
            <div>
              <Label>CEP</Label>
              <Input value={form.zipCode} onChange={(e) => set('zipCode', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
            <div>
              <Label>RNTRC</Label>
              <Input value={form.rntrc} onChange={(e) => set('rntrc', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(13) 99999-9999" />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={form.finalConsumer}
                onChange={(e) => set('finalConsumer', e.target.checked)}
              />
              Consumidor final
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={form.publicAgency}
                onChange={(e) => set('publicAgency', e.target.checked)}
              />
              Órgão público
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.push(backHref)}>
              Voltar
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
