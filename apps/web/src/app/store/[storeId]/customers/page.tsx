'use client';

import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { CustomerAddressFields, customerAddressPayload, type CustomerAddressForm } from '@/components/customer-address-fields';
import { Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';

interface CustomerAddress {
  id?: string;
  street: string;
  number?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode?: string;
  isDefault?: boolean;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  document?: string;
  addresses: CustomerAddress[];
}

interface CustomerForm extends CustomerAddressForm {
  name: string;
  phone: string;
  document: string;
}

const emptyForm: CustomerForm = {
  name: '',
  phone: '',
  document: '',
  zipCode: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: 'SP',
};

function addressFromCustomer(addr?: CustomerAddress): CustomerAddressForm {
  return {
    zipCode: addr?.zipCode ?? '',
    street: addr?.street ?? '',
    number: addr?.number ?? '',
    neighborhood: addr?.neighborhood ?? '',
    city: addr?.city ?? '',
    state: addr?.state ?? 'SP',
  };
}

function buildAddressPayload(form: CustomerForm) {
  return customerAddressPayload(form);
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);

  async function load() {
    const res = await api<{ data: Customer[] }>(`/customers?search=${encodeURIComponent(search)}`, {}, getToken());
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
      ...addressFromCustomer(addr),
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
          addresses: [buildAddressPayload(form)],
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
          addresses: [buildAddressPayload(editForm)],
        }),
      }, getToken());
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar cliente');
    }
  }

  function identityFields(value: CustomerForm, onChange: (v: CustomerForm) => void) {
    return (
      <>
        <div>
          <Label>Nome</Label>
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Telefone</Label>
            <Input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <Label>CPF/CNPJ</Label>
            <Input value={value.document} onChange={(e) => onChange({ ...value, document: e.target.value })} />
          </div>
        </div>
      </>
    );
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader title="Clientes" subtitle="Cadastro e busca de clientes da rede" />

      <Card className="mb-6">
        <Label>Buscar cliente</Label>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
            </svg>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, telefone ou documento"
              className="pl-10"
            />
          </div>
          {search ? (
            <Button type="button" variant="secondary" onClick={() => setSearch('')}>
              Limpar
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
          {formError && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          )}
          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-3">
              {identityFields(editForm, setEditForm)}
              <CustomerAddressFields
                value={editForm}
                onChange={(address) => setEditForm({ ...editForm, ...address })}
              />
              <div className="flex gap-2 pt-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="secondary" onClick={() => { setEditing(null); setFormError(''); }}>Cancelar</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              {identityFields(form, setForm)}
              <CustomerAddressFields
                value={form}
                onChange={(address) => setForm({ ...form, ...address })}
              />
              <Button type="submit" className="mt-2">Cadastrar</Button>
            </form>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
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
              {customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-slate-400">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
