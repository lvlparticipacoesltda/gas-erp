'use client';

import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { Pagination } from '@/components/pagination';
import { Badge, Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { ROLE_LABELS, USER_ROLES, type PaginatedResponse } from '@gas-erp/shared';
import {
  effectivePermissions,
  PermissionCheckboxes,
  permissionsToPayload,
} from '@/components/permission-checkboxes';
import { StoreMultiSelect } from '@/components/store-multi-select';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  active: boolean;
  permissions: string[];
  userStores: { store: { id: string; name: string } }[];
}

interface Store {
  id: string;
  name: string;
  code: string;
}

function needsStoreAssignment(role: string) {
  return role !== 'ORG_MASTER' && role !== 'PLATFORM_ADMIN';
}

const emptyCreate = {
  name: '',
  email: '',
  password: 'admin123',
  role: 'ATTENDANT',
  storeIds: [] as string[],
  permissions: [] as string[],
};

export default function MasterUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState(emptyCreate);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'ATTENDANT',
    storeIds: [] as string[],
    active: true,
    password: '',
    permissions: [] as string[],
  });
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const PAGE_SIZE = 20;

  async function load() {
    const [u, s] = await Promise.all([
      api<PaginatedResponse<UserRow>>(`/users?page=${page}&pageSize=${PAGE_SIZE}`, {}, getToken()),
      api<Store[]>('/stores', {}, getToken()),
    ]);
    setUsers(u.data);
    setTotalPages(u.totalPages);
    setTotal(u.total);
    setStores(s);
  }

  useEffect(() => {
    load().finally(() => setReady(true));
  }, [page]);

  function startEdit(user: UserRow) {
    setFormError('');
    setEditing(user);
    setEditForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role,
      storeIds: user.userStores.map((us) => us.store.id),
      active: user.active,
      password: '',
      permissions: effectivePermissions(user.role, user.permissions),
    });
  }

  function onRoleChange(role: string, isEdit: boolean) {
    const defaults = effectivePermissions(role, []);
    if (isEdit) {
      setEditForm((f) => ({ ...f, role, permissions: defaults }));
    } else {
      setForm((f) => ({ ...f, role, permissions: defaults }));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (needsStoreAssignment(form.role) && form.storeIds.length === 0) {
      setFormError('Selecione ao menos uma loja para este usuário.');
      return;
    }
    try {
      await api(
        '/users',
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            storeIds: form.storeIds.length ? form.storeIds : undefined,
            permissions: permissionsToPayload(form.role, form.permissions),
          }),
        },
        getToken(),
      );
      setForm(emptyCreate);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar usuário');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    if (editing.active && !editForm.active) {
      const ok = confirm(
        `Desativar o usuário "${editing.name}"?\n\nEle não poderá mais fazer login no sistema.`,
      );
      if (!ok) return;
    }

    if (needsStoreAssignment(editForm.role) && editForm.storeIds.length === 0) {
      setFormError('Selecione ao menos uma loja para este usuário.');
      return;
    }

    setFormError('');
    const payload: Record<string, unknown> = {
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone || undefined,
      role: editForm.role,
      storeIds: editForm.storeIds,
      active: editForm.active,
      permissions: permissionsToPayload(editForm.role, editForm.permissions),
    };
    if (editForm.password) payload.password = editForm.password;
    try {
      await api(`/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) }, getToken());
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar usuário');
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
    <PageHeader title="Usuários" subtitle="Papéis, lojas e telas permitidas por usuário" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? 'Editar usuário' : 'Novo usuário'}</h2>
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
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Deixe em branco para manter"
                  minLength={6}
                />
              </div>
              <div>
                <Label>Papel</Label>
                <Select
                  value={editForm.role}
                  onChange={(e) => onRoleChange(e.target.value, true)}
                >
                  {USER_ROLES.filter((r) => r !== 'PLATFORM_ADMIN').map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              {needsStoreAssignment(editForm.role) ? (
                <StoreMultiSelect
                  stores={stores}
                  selected={editForm.storeIds}
                  onChange={(storeIds) => setEditForm({ ...editForm, storeIds })}
                  required
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Usuários Master têm acesso a todas as lojas da rede automaticamente.
                </p>
              )}
              <PermissionCheckboxes
                role={editForm.role}
                selected={editForm.permissions}
                onChange={(permissions) => setEditForm({ ...editForm, permissions })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                />
                Usuário ativo
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
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Papel</Label>
                <Select value={form.role} onChange={(e) => onRoleChange(e.target.value, false)}>
                  {USER_ROLES.filter((r) => r !== 'PLATFORM_ADMIN').map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              {needsStoreAssignment(form.role) ? (
                <StoreMultiSelect
                  stores={stores}
                  selected={form.storeIds}
                  onChange={(storeIds) => setForm({ ...form, storeIds })}
                  required
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Usuários Master têm acesso a todas as lojas da rede automaticamente.
                </p>
              )}
              <PermissionCheckboxes
                role={form.role}
                selected={form.permissions.length ? form.permissions : effectivePermissions(form.role, [])}
                onChange={(permissions) => setForm({ ...form, permissions })}
              />
              <Button type="submit">Cadastrar</Button>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </form>
          )}
        </Card>
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Papel</th>
              <th className="p-3">Lojas</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="p-3">
                  {u.name}
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3 text-slate-600">
                  {!needsStoreAssignment(u.role)
                    ? 'Todas'
                    : u.userStores.map((us) => us.store.name).join(', ') || '—'}
                </td>
                <td className="p-3">
                  <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="p-3 text-right">
                  <Button type="button" variant="secondary" onClick={() => startEdit(u)}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination
          className="mt-4"
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
