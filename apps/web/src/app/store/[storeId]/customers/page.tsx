'use client';

import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';

interface CustomerAddress {
  id?: string;
  street: string;
  number?: string;
  neighborhood?: string;
  city: string;
  state: string;
  isDefault?: boolean;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  document?: string;
  addresses: CustomerAddress[];
}

const emptyForm = {
  name: '',
  phone: '',
  document: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: 'SP',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);

  async function load() {
    const res = await api<{ data: Customer[] }>(`/customers?search=${search}`, {}, getToken());
    setCustomers(res.data);
  }

  useEffect(() => {
    load().finally(() => setReady(true));
  }, [search]);

  function startEdit(customer: Customer) {
    const addr = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0];
    setFormError('');
    setEditing(customer);
    setEditForm({
      name: customer.name,
      phone: customer.phone ?? '',
      document: customer.document ?? '',
      street: addr?.street ?? '',
      number: addr?.number ?? '',
      neighborhood: addr?.neighborhood ?? '',
      city: addr?.city ?? '',
      state: addr?.state ?? 'SP',
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    try {
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          document: form.document,
          addresses: [{
            street: form.street,
            number: form.number,
            neighborhood: form.neighborhood,
            city: form.city,
            state: form.state,
            isDefault: true,
          }],
        }),
      }, getToken());
      setForm(emptyForm);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar cliente');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError('');
    try {
      await api(`/customers/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          document: editForm.document,
          addresses: [{
            street: editForm.street,
            number: editForm.number,
            neighborhood: editForm.neighborhood,
            city: editForm.city,
            state: editForm.state,
            isDefault: true,
          }],
        }),
      }, getToken());
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar cliente');
    }
  }

  const formFields = (value: typeof emptyForm, onChange: (v: typeof emptyForm) => void) => (
    <>
      <div><Label>Nome</Label><Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required /></div>
      <div><Label>Telefone</Label><Input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} /></div>
      <div><Label>CPF/CNPJ</Label><Input value={value.document} onChange={(e) => onChange({ ...value, document: e.target.value })} /></div>
      <div><Label>Endereço</Label><Input value={value.street} onChange={(e) => onChange({ ...value, street: e.target.value })} /></div>
      <div><Label>Número</Label><Input value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} /></div>
      <div><Label>Bairro</Label><Input value={value.neighborhood} onChange={(e) => onChange({ ...value, neighborhood: e.target.value })} /></div>
      <div><Label>Cidade</Label><Input value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} /></div>
      <div><Label>UF</Label><Input value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value })} maxLength={2} /></div>
    </>
  );

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
    <PageHeader title="Clientes" subtitle="Cadastro e busca de clientes da rede" />
      <div className="mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou documento" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
          {formError && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          )}
          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-3">
              {formFields(editForm, setEditForm)}
              <div className="flex gap-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="secondary" onClick={() => { setEditing(null); setFormError(''); }}>Cancelar</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              {formFields(form, setForm)}
              <Button type="submit">Cadastrar</Button>
            </form>
          )}
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">Nome</th><th className="p-3">Telefone</th><th className="p-3">Endereço</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="p-3">{c.name}</td>
                <td className="p-3">{c.phone ?? '-'}</td>
                <td className="p-3">{c.addresses[0] ? `${c.addresses[0].street}, ${c.addresses[0].city}` : '-'}</td>
                <td className="p-3 text-right">
                  <Button type="button" variant="secondary" onClick={() => startEdit(c)}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
