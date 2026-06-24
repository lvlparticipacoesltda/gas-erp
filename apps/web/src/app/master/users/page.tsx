'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { ROLE_LABELS, USER_ROLES } from '@gas-erp/shared';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  userStores: { store: { name: string } }[];
}

interface Store { id: string; name: string }

export default function MasterUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState({
    name: '', email: '', password: 'admin123', role: 'ATTENDANT', storeIds: [] as string[],
  });

  async function load() {
    const [u, s] = await Promise.all([
      api<{ data: UserRow[] }>('/users', {}, getToken()),
      api<Store[]>('/stores', {}, getToken()),
    ]);
    setUsers(u.data);
    setStores(s);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api('/users', {
      method: 'POST',
      body: JSON.stringify({ ...form, storeIds: form.storeIds.length ? form.storeIds : undefined }),
    }, getToken());
    setForm({ name: '', email: '', password: 'admin123', role: 'ATTENDANT', storeIds: [] });
    load();
  }

  return (
    <AppShell mode="master">
      <PageHeader title="Usuários" subtitle="Controle de acesso por loja e papel" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Novo usuário</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div><Label>Senha</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
            <div>
              <Label>Papel</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {USER_ROLES.filter((r) => r !== 'PLATFORM_ADMIN').map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Lojas</Label>
              <Select
                multiple
                value={form.storeIds}
                onChange={(e) => setForm({ ...form, storeIds: Array.from(e.target.selectedOptions, (o) => o.value) })}
              >
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <Button type="submit">Cadastrar</Button>
          </form>
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">Nome</th><th className="p-3">Papel</th><th className="p-3">Lojas</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="p-3">{u.name}<div className="text-xs text-slate-500">{u.email}</div></td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3">{u.userStores.map((us) => us.store.name).join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AppShell>
  );
}
