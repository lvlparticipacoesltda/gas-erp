'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { FilterPanel } from '@/components/filter-panel';
import { PaginatedSection } from '@/components/paginated-section';
import { Modal } from '@/components/modal';
import { TableAction, TableActions } from '@/components/table-actions';
import { Badge, Button, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { ROLE_LABELS, USER_ROLES, type PaginatedResponse } from '@gas-erp/shared';
import {
  effectivePermissions,
  PermissionCheckboxes,
  permissionsToPayload,
} from '@/components/permission-checkboxes';
import { StoreMultiSelect } from '@/components/store-multi-select';
import { DEFAULT_TABLE_PAGE_SIZE } from '@/components/pagination';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  active: boolean;
  permissions: string[];
  cpf?: string | null;
  pis?: string | null;
  admittedAt?: string | null;
  jobTitle?: string | null;
  userStores: { store: { id: string; name: string } }[];
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
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
  cpf: '',
  pis: '',
  admittedAt: '',
  jobTitle: '',
};

const emptyFilters = {
  search: '',
  role: '',
  active: '',
};

const PANEL_ROLES = USER_ROLES.filter((r) => r !== 'PLATFORM_ADMIN' && r !== 'DELIVERER');

export default function MasterUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
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
    cpf: '',
    pis: '',
    admittedAt: '',
    jobTitle: '',
  });
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);

  useEffect(() => {
    api<Store[]>('/stores', {}, getToken())
      .then(setStores)
      .catch(() => setStores([]));
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (appliedFilters.search.trim()) params.set('search', appliedFilters.search.trim());
      if (appliedFilters.role) params.set('role', appliedFilters.role);
      if (appliedFilters.active) params.set('active', appliedFilters.active);
      const u = await api<PaginatedResponse<UserRow>>(
        `/users?${params}`,
        {},
        getToken(),
      );
      setUsers(u.data);
      setTotalPages(u.totalPages);
      setTotal(u.total);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, appliedFilters]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(draftFilters);
  }

  function resetFilters() {
    setDraftFilters(emptyFilters);
    setPage(1);
    setAppliedFilters(emptyFilters);
  }
  function openCreate() {
    setFormError('');
    setForm(emptyCreate);
    setEditing(null);
    setModal('create');
  }

  function openEdit(user: UserRow) {
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
      cpf: user.cpf ?? '',
      pis: user.pis ?? '',
      admittedAt: toDateInputValue(user.admittedAt),
      jobTitle: user.jobTitle ?? '',
    });
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setFormError('');
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
    setSaving(true);
    try {
      await api(
        '/users',
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            storeIds: form.storeIds.length ? form.storeIds : undefined,
            permissions: permissionsToPayload(form.role, form.permissions),
            cpf: form.cpf || undefined,
            pis: form.pis || undefined,
            admittedAt: form.admittedAt || undefined,
            jobTitle: form.jobTitle || undefined,
          }),
        },
        getToken(),
      );
      closeModal();
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar usuário');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(user: UserRow) {
    if (!user.active) return;
    if (
      !window.confirm(
        `Inativar o usuário "${user.name}"?\n\nEle não poderá mais fazer login no sistema, mas continuará listado como inativo.`,
      )
    ) {
      return;
    }
    setFormError('');
    try {
      await api(
        `/users/${user.id}`,
        { method: 'PATCH', body: JSON.stringify({ active: false }) },
        getToken(),
      );
      if (editing?.id === user.id) closeModal();
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao inativar usuário');
    }
  }

  async function handleDelete(user: UserRow) {
    if (
      !window.confirm(
        `Excluir permanentemente o usuário "${user.name}"?\n\nEsta ação não pode ser desfeita. O cadastro será removido do sistema.`,
      )
    ) {
      return;
    }
    setFormError('');
    try {
      await api(`/users/${user.id}`, { method: 'DELETE' }, getToken());
      if (editing?.id === user.id) closeModal();
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao excluir usuário');
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
      cpf: editForm.cpf || null,
      pis: editForm.pis || null,
      admittedAt: editForm.admittedAt || null,
      jobTitle: editForm.jobTitle || null,
    };
    if (editForm.password) payload.password = editForm.password;
    setSaving(true);
    try {
      await api(`/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) }, getToken());
      closeModal();
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar usuário');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle="Acesso ao painel web — papéis, lojas e telas permitidas"
      />

      <FilterPanel onSearch={applyFilters} onReset={resetFilters} searching={loading}>
        <div>
          <Label>Nome ou e-mail</Label>
          <Input
            value={draftFilters.search}
            onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
            placeholder="Buscar usuário"
          />
        </div>
        <div>
          <Label>Função</Label>
          <Select
            value={draftFilters.role}
            onChange={(e) => setDraftFilters({ ...draftFilters, role: e.target.value })}
          >
            <option value="">Todas</option>
                  {USER_ROLES.filter((r) => r !== 'PLATFORM_ADMIN' && r !== 'DELIVERER').map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={draftFilters.active}
            onChange={(e) => setDraftFilters({ ...draftFilters, active: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </Select>
        </div>
      </FilterPanel>

      <div className="mb-4 flex justify-end">
        <Button type="button" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Criar
        </Button>
      </div>

      <PaginatedSection
        loading={loading}
        pagination={{
          className: 'mt-4',
          page,
          totalPages,
          total,
          pageSize,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPage(1);
            setPageSize(size);
          },
        }}
      >
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Papel</th>
              <th className="p-3 min-w-[12rem]">Lojas</th>
              <th className="p-3">Cargo</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">{u.name}</td>
                <td className="p-3 text-slate-600">{u.email}</td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3 text-slate-600">
                  {!needsStoreAssignment(u.role)
                    ? 'Todas'
                    : u.userStores.map((us) => us.store.name).join(', ') || '—'}
                </td>
                <td className="p-3 text-slate-600">{u.jobTitle || '—'}</td>
                <td className="p-3">
                  <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="p-3">
                  <TableActions>
                    <TableAction onClick={() => openEdit(u)}>Editar</TableAction>
                    {u.active ? (
                      <TableAction tone="muted" onClick={() => handleDeactivate(u)}>
                        Inativar
                      </TableAction>
                    ) : null}
                    <TableAction tone="danger" onClick={() => handleDelete(u)}>
                      Remover
                    </TableAction>
                  </TableActions>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </PaginatedSection>

      <Modal
        open={modal === 'create'}
        onClose={closeModal}
        title="Novo usuário"
        subtitle="Acesso ao painel web"
        size="xl"
      >
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>CPF</Label>
              <Input
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                placeholder="Opcional"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>PIS</Label>
              <Input
                value={form.pis}
                onChange={(e) => setForm({ ...form, pis: e.target.value })}
                placeholder="Opcional"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Data de admissão</Label>
              <Input
                type="date"
                value={form.admittedAt}
                onChange={(e) => setForm({ ...form, admittedAt: e.target.value })}
              />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                placeholder="Opcional"
              />
            </div>
          </div>
          <div>
            <Label>Papel</Label>
            <Select value={form.role} onChange={(e) => onRoleChange(e.target.value, false)}>
              {USER_ROLES.filter((r) => r !== 'PLATFORM_ADMIN' && r !== 'DELIVERER').map((r) => (
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
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Cadastrando…' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modal === 'edit' && editing != null}
        onClose={closeModal}
        title="Editar usuário"
        subtitle={editing?.name}
        size="xl"
      >
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>CPF</Label>
              <Input
                value={editForm.cpf}
                onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })}
                placeholder="Opcional"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>PIS</Label>
              <Input
                value={editForm.pis}
                onChange={(e) => setEditForm({ ...editForm, pis: e.target.value })}
                placeholder="Opcional"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Data de admissão</Label>
              <Input
                type="date"
                value={editForm.admittedAt}
                onChange={(e) => setEditForm({ ...editForm, admittedAt: e.target.value })}
              />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input
                value={editForm.jobTitle}
                onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })}
                placeholder="Opcional"
              />
            </div>
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
            <Select value={editForm.role} onChange={(e) => onRoleChange(e.target.value, true)}>
              {USER_ROLES.filter((r) => r !== 'PLATFORM_ADMIN' && r !== 'DELIVERER').map((r) => (
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
            Usuário ativo (desmarque para inativar o acesso ao sistema)
          </label>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
