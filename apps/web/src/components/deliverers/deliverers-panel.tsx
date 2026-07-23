'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { FilterPanel } from '@/components/filter-panel';
import { Modal } from '@/components/modal';
import { PaginatedSection } from '@/components/paginated-section';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateSlice,
  totalPagesFor,
} from '@/components/pagination';
import { TableAction, TableActions } from '@/components/table-actions';
import { Badge, Button, Input, Label, Select, Table } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import { canManageDeliverers, DELIVERER_STATUS_LABELS, type AuthUser } from '@gas-erp/shared';

export interface DelivererStoreLink {
  storeId: string;
  store: { id: string; name: string };
}

export interface DelivererRow {
  id: string;
  status: string;
  availableStoreId?: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    active: boolean;
    cpf?: string | null;
    pis?: string | null;
    admittedAt?: string | null;
    jobTitle?: string | null;
  };
  stores: DelivererStoreLink[];
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

interface StoreOption {
  id: string;
  name: string;
  active?: boolean;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'default'> = {
  AVAILABLE: 'success',
  ON_DELIVERY: 'warning',
  OFFLINE: 'default',
};

const emptyCreateForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  status: 'AVAILABLE',
  cpf: '',
  pis: '',
  admittedAt: '',
  jobTitle: '',
};

type DeliverersPanelProps = {
  /** Filtra a lista e pré-seleciona a unidade no cadastro */
  storeId?: string;
  /** Exibe filtro por unidade (painel master) */
  showStoreFilter?: boolean;
};

export function DeliverersPanel({ storeId, showStoreFilter = false }: DeliverersPanelProps) {
  const [deliverers, setDeliverers] = useState<DelivererRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeFilter, setStoreFilter] = useState('');
  const [editing, setEditing] = useState<DelivererRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createStores, setCreateStores] = useState<Set<string>>(() => new Set());
  const [createError, setCreateError] = useState('');
  const [actionError, setActionError] = useState('');
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [draftFilters, setDraftFilters] = useState({ search: '', status: '', active: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', status: '', active: '' });

  const listStoreId = storeId ?? (showStoreFilter && storeFilter ? storeFilter : undefined);

  const load = useCallback(() => {
    const deliverersUrl = listStoreId ? `/deliverers?storeId=${listStoreId}` : '/deliverers';
    return Promise.all([
      api<DelivererRow[]>(deliverersUrl, {}, getToken()),
      api<StoreOption[]>('/stores', {}, getToken()),
    ]).then(([d, s]) => {
      setDeliverers(d);
      setStores(s.filter((store) => store.active !== false));
    });
  }, [listStoreId]);

  useEffect(() => {
    const user = getStoredUser<AuthUser>();
    setCanManage(user ? canManageDeliverers(user.role) : false);
    setCreateStores(new Set(storeId ? [storeId] : []));
    load().finally(() => setReady(true));
  }, [load, storeId]);

  const filteredDeliverers = useMemo(() => {
    const term = appliedFilters.search.trim().toLowerCase();
    return deliverers.filter((d) => {
      if (appliedFilters.status && d.status !== appliedFilters.status) return false;
      if (appliedFilters.active === 'true' && !d.user.active) return false;
      if (appliedFilters.active === 'false' && d.user.active) return false;
      if (!term) return true;
      const haystack = [d.user.name, d.user.email, d.user.phone, ...d.stores.map((s) => s.store.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [deliverers, appliedFilters]);

  const total = filteredDeliverers.length;
  const totalPages = totalPagesFor(total, pageSize);
  const pageDeliverers = paginateSlice(filteredDeliverers, Math.min(page, totalPages), pageSize);

  useEffect(() => {
    setPage(1);
  }, [listStoreId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(draftFilters);
  }

  function resetFilters() {
    setDraftFilters({ search: '', status: '', active: '' });
    setPage(1);
    setAppliedFilters({ search: '', status: '', active: '' });
  }

  function openCreate() {
    setCreateError('');
    setCreateForm(emptyCreateForm);
    setCreateStores(new Set(storeId ? [storeId] : []));
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError('');
  }

  function toggleCreateStore(id: string) {
    setCreateStores((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (createStores.size === 0) {
      setCreateError('Selecione ao menos uma unidade.');
      return;
    }
    setCreating(true);
    try {
      await api(
        '/deliverers',
        {
          method: 'POST',
          body: JSON.stringify({
            ...createForm,
            phone: createForm.phone || undefined,
            cpf: createForm.cpf || undefined,
            pis: createForm.pis || undefined,
            admittedAt: createForm.admittedAt || undefined,
            jobTitle: createForm.jobTitle || undefined,
            storeIds: [...createStores],
          }),
        },
        getToken(),
      );
      closeCreate();
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Não foi possível cadastrar o entregador.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeactivate(deliverer: DelivererRow) {
    if (!deliverer.user.active) return;
    if (
      !window.confirm(
        `Inativar o entregador "${deliverer.user.name}"?\n\nEle não poderá mais usar o aplicativo, mas continuará listado como inativo.`,
      )
    ) {
      return;
    }
    setActionError('');
    try {
      await api(
        `/deliverers/${deliverer.id}`,
        { method: 'PATCH', body: JSON.stringify({ active: false }) },
        getToken(),
      );
      if (editing?.id === deliverer.id) setEditing(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao inativar entregador');
    }
  }

  async function handleDelete(deliverer: DelivererRow) {
    if (
      !window.confirm(
        `Excluir permanentemente o entregador "${deliverer.user.name}"?\n\nO cadastro será removido. As vendas antigas permanecem, mas sem vínculo com este entregador.`,
      )
    ) {
      return;
    }
    setActionError('');
    try {
      await api(`/deliverers/${deliverer.id}`, { method: 'DELETE' }, getToken());
      if (editing?.id === deliverer.id) setEditing(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao excluir entregador');
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      {actionError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <FilterPanel onSearch={applyFilters} onReset={resetFilters}>
        <div>
          <Label>Nome ou e-mail</Label>
          <Input
            value={draftFilters.search}
            onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
            placeholder="Buscar entregador"
          />
        </div>
        {showStoreFilter ? (
          <div>
            <Label>Unidade</Label>
            <Select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
              <option value="">Todas as unidades</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div>
          <Label>Status operacional</Label>
          <Select
            value={draftFilters.status}
            onChange={(e) => setDraftFilters({ ...draftFilters, status: e.target.value })}
          >
            <option value="">Todos</option>
            {Object.entries(DELIVERER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Acesso app</Label>
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

      {canManage ? (
        <div className="mb-4 flex justify-end">
          <Button type="button" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Criar
          </Button>
        </div>
      ) : null}

      <PaginatedSection
        pagination={{
          className: 'mt-4',
          page: Math.min(page, totalPages),
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
            <th className="p-3">Telefone</th>
            <th className="p-3">Acesso app</th>
            <th className="p-3">Status</th>
            <th className="p-3 min-w-[12rem]">Unidades</th>
            {canManage && <th className="p-3 text-right">Ação</th>}
          </tr>
        </thead>
        <tbody>
          {pageDeliverers.map((d) => (
            <tr key={d.id} className="border-t border-slate-100 align-top">
              <td className="p-3 font-medium text-slate-800">{d.user.name}</td>
              <td className="p-3 text-sm text-slate-600">{d.user.email}</td>
              <td className="p-3">{d.user.phone ?? '—'}</td>
              <td className="p-3">
                <Badge tone={d.user.active ? 'success' : 'danger'}>
                  {d.user.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </td>
              <td className="p-3">
                <Badge tone={STATUS_TONE[d.status] ?? 'default'}>
                  {DELIVERER_STATUS_LABELS[d.status] ?? d.status}
                </Badge>
              </td>
              <td className="p-3 text-slate-600">
                {d.stores.length === 0
                  ? '—'
                  : d.stores.map((s) => s.store.name).join(', ')}
              </td>
              {canManage && (
                <td className="p-3">
                  <TableActions>
                    <TableAction onClick={() => setEditing(d)}>Editar</TableAction>
                    {d.user.active ? (
                      <TableAction tone="muted" onClick={() => handleDeactivate(d)}>
                        Inativar
                      </TableAction>
                    ) : null}
                    <TableAction tone="danger" onClick={() => handleDelete(d)}>
                      Remover
                    </TableAction>
                  </TableActions>
                </td>
              )}
            </tr>
          ))}
          {pageDeliverers.length === 0 && (
            <tr>
              <td colSpan={canManage ? 7 : 6} className="p-6 text-center text-slate-400">
                {listStoreId
                  ? 'Nenhum entregador vinculado a esta unidade.'
                  : 'Nenhum entregador encontrado.'}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      </PaginatedSection>

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="Novo entregador"
        subtitle="Acesso somente pelo aplicativo móvel — não usa o painel web."
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          {createError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </p>
          ) : null}
          <div>
            <Label>Nome</Label>
            <Input
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              placeholder="Opcional"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>CPF</Label>
              <Input
                value={createForm.cpf}
                onChange={(e) => setCreateForm({ ...createForm, cpf: e.target.value })}
                placeholder="Opcional"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>PIS</Label>
              <Input
                value={createForm.pis}
                onChange={(e) => setCreateForm({ ...createForm, pis: e.target.value })}
                placeholder="Opcional"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Data de admissão</Label>
              <Input
                type="date"
                value={createForm.admittedAt}
                onChange={(e) => setCreateForm({ ...createForm, admittedAt: e.target.value })}
              />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input
                value={createForm.jobTitle}
                onChange={(e) => setCreateForm({ ...createForm, jobTitle: e.target.value })}
                placeholder="Opcional"
              />
            </div>
          </div>
          <div>
            <Label>Senha inicial</Label>
            <Input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              minLength={6}
              required
            />
          </div>
          <div>
            <Label>Status inicial</Label>
            <Select
              value={createForm.status}
              onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
            >
              {Object.entries(DELIVERER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Unidades atendidas</Label>
            <div className="mt-1 max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {stores.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={createStores.has(s.id)}
                    onChange={() => toggleCreateStore(s.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeCreate} disabled={creating}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? 'Cadastrando…' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </Modal>

      {editing && (
        <EditDelivererModal
          deliverer={editing}
          stores={stores}
          preferredStoreId={listStoreId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function EditDelivererModal({
  deliverer,
  stores,
  preferredStoreId,
  onClose,
  onSaved,
}: {
  deliverer: DelivererRow;
  stores: StoreOption[];
  preferredStoreId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(deliverer.stores.map((s) => s.storeId)),
  );
  const [name, setName] = useState(deliverer.user.name);
  const [email, setEmail] = useState(deliverer.user.email);
  const [phone, setPhone] = useState(deliverer.user.phone ?? '');
  const [password, setPassword] = useState('');
  const [cpf, setCpf] = useState(deliverer.user.cpf ?? '');
  const [pis, setPis] = useState(deliverer.user.pis ?? '');
  const [admittedAt, setAdmittedAt] = useState(toDateInputValue(deliverer.user.admittedAt));
  const [jobTitle, setJobTitle] = useState(deliverer.user.jobTitle ?? '');
  const [status, setStatus] = useState(deliverer.status);
  const [active, setActive] = useState(deliverer.user.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setError('Selecione ao menos uma unidade.');
      return;
    }
    if (name.trim().length < 2) {
      setError('Informe o nome do entregador.');
      return;
    }
    if (!email.trim()) {
      setError('Informe o e-mail do entregador.');
      return;
    }
    if (password && password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (deliverer.user.active && !active) {
      const ok = confirm(
        `Inativar o entregador "${deliverer.user.name}"?\n\nEle não poderá mais fazer login no aplicativo, mas continuará listado como inativo.`,
      );
      if (!ok) return;
    }

    let availableStoreId: string | null | undefined;
    if (status === 'OFFLINE' || !active) {
      availableStoreId = null;
    } else if (status === 'AVAILABLE' || status === 'ON_DELIVERY') {
      const selectedIds = [...selected];
      availableStoreId =
        (deliverer.availableStoreId && selected.has(deliverer.availableStoreId)
          ? deliverer.availableStoreId
          : null)
        ?? (preferredStoreId && selected.has(preferredStoreId) ? preferredStoreId : null)
        ?? (selectedIds.length === 1 ? selectedIds[0] : null);
      if (!availableStoreId) {
        setError('Selecione uma única unidade ou marque disponibilidade pelo mapa da unidade.');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await api(
        `/deliverers/${deliverer.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim() || undefined,
            ...(password ? { password } : {}),
            cpf: cpf || null,
            pis: pis || null,
            admittedAt: admittedAt || null,
            jobTitle: jobTitle || null,
            storeIds: [...selected],
            status,
            active,
            ...(availableStoreId !== undefined ? { availableStoreId } : {}),
          }),
        },
        getToken(),
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar entregador"
      subtitle="Credenciais para o aplicativo móvel do entregador."
      size="lg"
    >
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>E-mail</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label>Telefone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>CPF</Label>
            <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="Opcional" inputMode="numeric" />
          </div>
          <div>
            <Label>PIS</Label>
            <Input value={pis} onChange={(e) => setPis(e.target.value)} placeholder="Opcional" inputMode="numeric" />
          </div>
          <div>
            <Label>Data de admissão</Label>
            <Input type="date" value={admittedAt} onChange={(e) => setAdmittedAt(e.target.value)} />
          </div>
          <div>
            <Label>Cargo</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div>
          <Label>Nova senha</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            placeholder="Deixe em branco para manter a atual"
            autoComplete="new-password"
          />
        </div>

        <div>
          <Label>Unidades atendidas</Label>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {stores.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand"
                />
                {s.name}
              </label>
            ))}
            {stores.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-slate-400">Nenhuma unidade disponível.</p>
            )}
          </div>
        </div>

        <div>
          <Label>Status operacional</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={!active}>
            {Object.entries(DELIVERER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand"
          />
          Entregador ativo (pode usar o aplicativo)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
