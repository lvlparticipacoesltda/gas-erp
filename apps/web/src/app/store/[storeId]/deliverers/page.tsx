'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { Badge, Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import { canManageDeliverers, DELIVERER_STATUS_LABELS } from '@gas-erp/shared';
import type { AuthUser } from '@gas-erp/shared';

interface DelivererStoreLink {
  storeId: string;
  store: { id: string; name: string };
}

interface Deliverer {
  id: string;
  status: string;
  user: { id: string; name: string; email: string; phone?: string };
  stores: DelivererStoreLink[];
}

interface StoreOption {
  id: string;
  name: string;
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
};

export default function DeliverersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [deliveriesCount, setDeliveriesCount] = useState(0);
  const [editing, setEditing] = useState<Deliverer | null>(null);
  const [ready, setReady] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createStores, setCreateStores] = useState<Set<string>>(() => new Set());
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    return Promise.all([
      api<Deliverer[]>(`/deliverers?storeId=${storeId}`, {}, getToken()),
      api<unknown[]>(`/deliveries?storeId=${storeId}`, {}, getToken()),
      api<StoreOption[]>('/stores', {}, getToken()),
    ]).then(([d, del, s]) => {
      setDeliverers(d);
      setDeliveriesCount(del.length);
      setStores(s);
    });
  }, [storeId]);

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

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader title="Entregadores" subtitle={`${deliveriesCount} entregas ativas hoje`} />

      <div className={canManage ? 'grid gap-6 lg:grid-cols-2' : ''}>
        {canManage && (
          <Card>
            <h2 className="mb-4 font-semibold">Novo entregador</h2>
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

        <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Telefone</th>
              <th className="p-3">Status</th>
              <th className="p-3">Unidades atendidas</th>
              {canManage && <th className="p-3 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {deliverers.map((d) => (
              <tr key={d.id} className="border-t border-slate-100 align-top">
                <td className="p-3 font-medium text-slate-800">{d.user.name}</td>
                <td className="p-3">{d.user.phone ?? '-'}</td>
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
                    <Button variant="secondary" onClick={() => setEditing(d)}>
                      Editar
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {deliverers.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="p-6 text-center text-slate-400">
                  Nenhum entregador vinculado a esta unidade.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      {editing && (
        <EditDelivererModal
          deliverer={editing}
          stores={stores}
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
  onClose,
  onSaved,
}: {
  deliverer: Deliverer;
  stores: StoreOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(deliverer.stores.map((s) => s.storeId)),
  );
  const [status, setStatus] = useState(deliverer.status);
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
    setSaving(true);
    setError(null);
    try {
      await api(
        `/deliverers/${deliverer.id}`,
        { method: 'PATCH', body: JSON.stringify({ storeIds: [...selected], status }) },
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
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">Editar entregador</h2>
        <p className="mt-1 text-sm text-slate-500">{deliverer.user.name}</p>

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
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(DELIVERER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

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
