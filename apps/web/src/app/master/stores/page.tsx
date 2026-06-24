'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';

interface Store {
  id: string;
  name: string;
  code: string;
  city?: string;
  state?: string;
  address?: string;
  active: boolean;
}

const emptyCreate = { name: '', code: '', city: '', state: 'SP', address: '' };

export default function MasterStoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState(emptyCreate);
  const [editing, setEditing] = useState<Store | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    city: '',
    state: '',
    address: '',
    active: true,
  });
  const [formError, setFormError] = useState('');

  async function load() {
    setStores(await api<Store[]>('/stores', {}, getToken()));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(store: Store) {
    setFormError('');
    setEditing(store);
    setEditForm({
      name: store.name,
      code: store.code,
      city: store.city ?? '',
      state: store.state ?? '',
      address: store.address ?? '',
      active: store.active,
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    try {
      await api('/stores', { method: 'POST', body: JSON.stringify(form) }, getToken());
      setForm(emptyCreate);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar loja');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    if (editing.active && !editForm.active) {
      const ok = confirm(
        `Desativar a loja "${editing.name}"?\n\nUsuários vinculados não poderão operar nesta unidade.`,
      );
      if (!ok) return;
    }

    setFormError('');
    try {
      await api(`/stores/${editing.id}`, { method: 'PATCH', body: JSON.stringify(editForm) }, getToken());
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar loja');
    }
  }

  return (
    <AppShell mode="master">
      <PageHeader title="Lojas" subtitle="Gerencie as unidades da rede" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? 'Editar loja' : 'Nova loja'}</h2>
          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Código</Label>
                <Input
                  value={editForm.code}
                  onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Input
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  maxLength={2}
                />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                />
                Loja ativa
              </label>
              <div className="flex gap-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="secondary" onClick={() => { setEditing(null); setFormError(''); }}>
                  Cancelar
                </Button>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label>Código</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label>Estado</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <Button type="submit">Cadastrar</Button>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </form>
          )}
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Código</th>
              <th className="p-3">Cidade</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">{s.name}</td>
                <td className="p-3">{s.code}</td>
                <td className="p-3">{s.city}</td>
                <td className="p-3">
                  <Badge tone={s.active ? 'success' : 'danger'}>{s.active ? 'Ativa' : 'Inativa'}</Badge>
                </td>
                <td className="p-3 text-right">
                  <Button type="button" variant="secondary" onClick={() => startEdit(s)}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AppShell>
  );
}
