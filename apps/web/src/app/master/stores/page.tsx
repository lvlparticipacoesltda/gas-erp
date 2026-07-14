'use client';

import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import {
  CustomerAddressFields,
  type CustomerAddressForm,
} from '@/components/customer-address-fields';
import { Badge, Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCep } from '@/lib/viacep';

interface Store {
  id: string;
  name: string;
  code: string;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Legado */
  address?: string | null;
  active: boolean;
}

type StoreAddressForm = CustomerAddressForm & {
  complement: string;
  landmark: string;
};

const emptyAddress: StoreAddressForm = {
  zipCode: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: 'SP',
  complement: '',
  landmark: '',
};

const emptyCreate = {
  name: '',
  code: '',
  ...emptyAddress,
};

function addressFromStore(store: Store): StoreAddressForm {
  return {
    zipCode: store.zipCode ? formatCep(store.zipCode) : '',
    street: store.street ?? '',
    number: store.number ?? '',
    neighborhood: store.neighborhood ?? '',
    city: store.city ?? '',
    state: store.state ?? '',
    complement: store.complement ?? '',
    landmark: store.landmark ?? '',
  };
}

function addressPayload(form: StoreAddressForm) {
  return {
    zipCode: form.zipCode.replace(/\D/g, '') || undefined,
    street: form.street.trim() || undefined,
    number: form.number.trim() || undefined,
    complement: form.complement.trim() || undefined,
    neighborhood: form.neighborhood.trim() || undefined,
    city: form.city.trim() || undefined,
    state: form.state.trim() || undefined,
    landmark: form.landmark.trim() || undefined,
  };
}

function formatStoreCity(store: Store) {
  const city = [store.city, store.state].filter(Boolean).join(' - ');
  if (city) return city;
  return store.address ?? '—';
}

export default function MasterStoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState(emptyCreate);
  const [editing, setEditing] = useState<Store | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    active: true,
    ...emptyAddress,
  });
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);

  async function load() {
    setStores(await api<Store[]>('/stores', {}, getToken()));
  }

  useEffect(() => {
    load().finally(() => setReady(true));
  }, []);

  function startEdit(store: Store) {
    setFormError('');
    setEditing(store);
    setEditForm({
      name: store.name,
      code: store.code,
      active: store.active,
      ...addressFromStore(store),
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    try {
      await api(
        '/stores',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            code: form.code,
            ...addressPayload(form),
          }),
        },
        getToken(),
      );
      setForm(emptyCreate);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar loja');
    }
  }

  async function handleDeactivate(store: Store) {
    if (!store.active) return;
    if (
      !window.confirm(
        `Inativar a loja "${store.name}"?\n\nUsuários vinculados não poderão operar nesta unidade, mas ela continuará listada como inativa.`,
      )
    ) {
      return;
    }
    setFormError('');
    try {
      await api(
        `/stores/${store.id}`,
        { method: 'PATCH', body: JSON.stringify({ active: false }) },
        getToken(),
      );
      if (editing?.id === store.id) setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao inativar loja');
    }
  }

  async function handleDelete(store: Store) {
    if (
      !window.confirm(
        `Excluir permanentemente a loja "${store.name}"?\n\nTodos os dados desta unidade serão apagados: vendas, clientes, estoque, entregas, notas de compra e transferências. Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setFormError('');
    try {
      await api(`/stores/${store.id}`, { method: 'DELETE' }, getToken());
      if (editing?.id === store.id) setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao excluir loja');
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
      await api(
        `/stores/${editing.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editForm.name,
            code: editForm.code,
            active: editForm.active,
            ...addressPayload(editForm),
          }),
        },
        getToken(),
      );
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar loja');
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
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
              <CustomerAddressFields
                value={editForm}
                onChange={(address) => setEditForm({ ...editForm, ...address })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Complemento</Label>
                  <Input
                    value={editForm.complement}
                    onChange={(e) => setEditForm({ ...editForm, complement: e.target.value })}
                    placeholder="Sala, bloco…"
                  />
                </div>
                <div>
                  <Label>Ponto de referência</Label>
                  <Input
                    value={editForm.landmark}
                    onChange={(e) => setEditForm({ ...editForm, landmark: e.target.value })}
                  />
                </div>
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
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditing(null);
                    setFormError('');
                  }}
                >
                  Cancelar
                </Button>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Código</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                />
              </div>
              <CustomerAddressFields
                value={form}
                onChange={(address) => setForm({ ...form, ...address })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Complemento</Label>
                  <Input
                    value={form.complement}
                    onChange={(e) => setForm({ ...form, complement: e.target.value })}
                    placeholder="Sala, bloco…"
                  />
                </div>
                <div>
                  <Label>Ponto de referência</Label>
                  <Input
                    value={form.landmark}
                    onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  />
                </div>
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
                <td className="p-3">{formatStoreCity(s)}</td>
                <td className="p-3">
                  <Badge tone={s.active ? 'success' : 'danger'}>
                    {s.active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => startEdit(s)}>
                      Editar
                    </Button>
                    {s.active ? (
                      <Button type="button" variant="secondary" onClick={() => handleDeactivate(s)}>
                        Inativar
                      </Button>
                    ) : null}
                    <Button type="button" variant="danger" onClick={() => handleDelete(s)}>
                      Excluir
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
