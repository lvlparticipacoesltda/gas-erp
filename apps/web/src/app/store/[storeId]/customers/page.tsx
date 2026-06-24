'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  document?: string;
  addresses: { street: string; city: string }[];
}

export default function CustomersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', document: '', street: '', city: '', state: 'SP',
  });

  async function load() {
    const res = await api<{ data: Customer[] }>(`/customers?search=${search}`, {}, getToken());
    setCustomers(res.data);
  }

  useEffect(() => { load(); }, [search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        document: form.document,
        addresses: [{ street: form.street, city: form.city, state: form.state, isDefault: true }],
      }),
    }, getToken());
    setForm({ name: '', phone: '', document: '', street: '', city: '', state: 'SP' });
    load();
  }

  return (
    <AppShell mode="store">
      <PageHeader title="Clientes" subtitle="Cadastro e busca de clientes da rede" />
      <div className="mb-4"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou documento" /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Novo cliente</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>CPF/CNPJ</Label><Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></div>
            <div><Label>Endereço</Label><Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></div>
            <div><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <Button type="submit">Cadastrar</Button>
          </form>
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">Nome</th><th className="p-3">Telefone</th><th className="p-3">Endereço</th></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="p-3">{c.name}</td>
                <td className="p-3">{c.phone ?? '-'}</td>
                <td className="p-3">{c.addresses[0] ? `${c.addresses[0].street}, ${c.addresses[0].city}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AppShell>
  );
}
