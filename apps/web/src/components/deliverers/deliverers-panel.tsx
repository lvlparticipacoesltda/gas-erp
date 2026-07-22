'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { Badge, Button, Card, Input, Label, Select, Table } from '@/components/ui';
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
  const [ready, setReady] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createStores, setCreateStores] = useState<Set<string>>(() => new Set());
  const [createError, setCreateError] = useState('');
  const [actionError, setActionError] = useState('');
  const [creating, setCreating] = useState(false);

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
      setCreateForm(emptyCreateForm);
      setCreateStores(new Set(storeId ? [storeId] : []));
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
      <div className={canManage ? 'grid gap-6 lg:grid-cols-2' : ''}>
        {canManage && (
          <Card>
            <h2 className="mb-1 font-semibold">Novo entregador</h2>
            <p className="mb-4 text-sm text-slate-500">
              Acesso somente pelo aplicativo móvel — não usa o painel web.
            </p>
            {createError && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </p>
            )}
            <form onSubmit={handleCreate} className="space-y-3">
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
              <Button type="submit" disabled={creating}>
                {creating ? 'Cadastrando…' : 'Cadastrar entregador'}
              </Button>
            </form>
          </Card>
        )}

        <div className={canManage ? '' : 'col-span-full'}>
          {showStoreFilter && (
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem]">
                <Label>Filtrar por unidade</Label>
                <Select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
                  <option value="">Todas as unidades</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          <Table>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Nome</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Telefone</th>
                <th className="p-3">Acesso app</th>
                <th className="p-3">Status</th>
                <th className="p-3">Unidades</th>
                {canManage && <th className="p-3 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {deliverers.map((d) => (
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
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {d.stores.length === 0 ? (
                        <span className="text-slate-400">Nenhuma</span>
                      ) : (
                        d.stores.map((s) => (
                          <Badge key={s.storeId} tone="default">
                            {s.store.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  {canManage && (
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setEditing(d)}>
                          Editar
                        </Button>
                        {d.user.active ? (
                          <Button variant="secondary" onClick={() => handleDeactivate(d)}>
                            Inativar
                          </Button>
                        ) : null}
                        <Button variant="danger" onClick={() => handleDelete(d)}>
                          Excluir
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {deliverers.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="p-6 text-center text-slate-400">
                    {listStoreId
                      ? 'Nenhum entregador vinculado a esta unidade.'
                      : 'Nenhum entregador cadastrado na rede.'}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </div>

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

  async function save() {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">Editar entregador</h2>
        <p className="mt-1 text-sm text-slate-500">Credenciais para o aplicativo móvel do entregador.</p>

        <div className="mt-4 space-y-3">
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
        </div>

        <div className="mt-4">
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

        <div className="mt-4">
          <Label>Status operacional</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={!active}>
            {Object.entries(DELIVERER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand"
          />
          Entregador ativo (pode usar o aplicativo)
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
