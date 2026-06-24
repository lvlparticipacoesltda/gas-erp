'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';

interface Store {
  id: string;
  name: string;
  code: string;
  city?: string;
  state?: string;
  active: boolean;
}

export default function MasterStoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState({ name: '', code: '', city: '', state: 'SP' });

  async function load() {
    setStores(await api<Store[]>('/stores', {}, getToken()));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api('/stores', { method: 'POST', body: JSON.stringify(form) }, getToken());
    setForm({ name: '', code: '', city: '', state: 'SP' });
    load();
  }

  return (
    <AppShell mode="master">
      <PageHeader title="Lojas" subtitle="Gerencie as unidades da rede" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Nova loja</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Código</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></div>
            <div><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <Button type="submit">Cadastrar</Button>
          </form>
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">Nome</th><th className="p-3">Código</th><th className="p-3">Cidade</th></tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">{s.name}</td>
                <td className="p-3">{s.code}</td>
                <td className="p-3">{s.city}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AppShell>
  );
}
