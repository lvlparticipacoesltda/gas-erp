'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import {
  CustomerAddressFields,
  type CustomerAddressForm,
} from '@/components/customer-address-fields';
import { FilterPanel } from '@/components/filter-panel';
import { Modal } from '@/components/modal';
import { PaginatedSection } from '@/components/paginated-section';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateSlice,
  totalPagesFor,
} from '@/components/pagination';
import { TableAction, TableActions } from '@/components/table-actions';
import { Badge, Button, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { invalidateStoresCache } from '@/components/app-shell';
import { api, getToken } from '@/lib/api';
import { formatCnpj } from '@/lib/utils';
import { formatCep } from '@/lib/viacep';

interface Store {
  id: string;
  name: string;
  code: string;
  cnpj?: string | null;
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
  cnpj: '',
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

function formatStoreAddress(store: Store) {
  const line = [store.street, store.number].filter(Boolean).join(', ');
  const neighborhood = store.neighborhood?.trim();
  if (line && neighborhood) return `${line} · ${neighborhood}`;
  if (line) return line;
  if (neighborhood) return neighborhood;
  return store.address ?? '—';
}

export default function MasterStoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState(emptyCreate);
  const [editing, setEditing] = useState<Store | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    cnpj: '',
    active: true,
    ...emptyAddress,
  });
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [draftFilters, setDraftFilters] = useState({ search: '', active: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', active: '' });

  async function load() {
    invalidateStoresCache();
    setStores(await api<Store[]>('/stores', {}, getToken()));
  }

  useEffect(() => {
    load().finally(() => setReady(true));
  }, []);

  const filteredStores = useMemo(() => {
    const term = appliedFilters.search.trim().toLowerCase();
    return stores.filter((store) => {
      if (appliedFilters.active === 'true' && !store.active) return false;
      if (appliedFilters.active === 'false' && store.active) return false;
      if (!term) return true;
      const haystack = [
        store.name,
        store.code,
        store.cnpj,
        store.city,
        store.state,
        store.street,
        store.neighborhood,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [stores, appliedFilters]);

  const total = filteredStores.length;
  const totalPages = totalPagesFor(total, pageSize);
  const pageStores = paginateSlice(filteredStores, Math.min(page, totalPages), pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(draftFilters);
  }

  function resetFilters() {
    setDraftFilters({ search: '', active: '' });
    setPage(1);
    setAppliedFilters({ search: '', active: '' });
  }
  function openCreate() {
    setFormError('');
    setForm(emptyCreate);
    setEditing(null);
    setModal('create');
  }

  function openEdit(store: Store) {
    setFormError('');
    setEditing(store);
    setEditForm({
      name: store.name,
      code: store.code,
      cnpj: store.cnpj ? formatCnpj(store.cnpj) : '',
      active: store.active,
      ...addressFromStore(store),
    });
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setFormError('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await api(
        '/stores',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            code: form.code,
            cnpj: form.cnpj.replace(/\D/g, '') || undefined,
            ...addressPayload(form),
          }),
        },
        getToken(),
      );
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar loja');
    } finally {
      setSaving(false);
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
      if (editing?.id === store.id) closeModal();
      await load();
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
      if (editing?.id === store.id) closeModal();
      await load();
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
    setSaving(true);
    try {
      await api(
        `/stores/${editing.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editForm.name,
            code: editForm.code,
            cnpj: editForm.cnpj.replace(/\D/g, '') || undefined,
            active: editForm.active,
            ...addressPayload(editForm),
          }),
        },
        getToken(),
      );
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar loja');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader title="Lojas" subtitle="Gerencie as unidades da rede" />

      <FilterPanel onSearch={applyFilters} onReset={resetFilters}>
        <div>
          <Label>Nome, código ou cidade</Label>
          <Input
            value={draftFilters.search}
            onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
            placeholder="Buscar loja"
          />
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={draftFilters.active}
            onChange={(e) => setDraftFilters({ ...draftFilters, active: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
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
              <th className="p-3">Código</th>
              <th className="p-3">CNPJ</th>
              <th className="p-3">Cidade</th>
              <th className="p-3 min-w-[14rem]">Endereço</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {pageStores.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">{s.name}</td>
                <td className="p-3">{s.code}</td>
                <td className="p-3 whitespace-nowrap">{s.cnpj ? formatCnpj(s.cnpj) : '—'}</td>
                <td className="p-3">{formatStoreCity(s)}</td>
                <td className="p-3 text-slate-600">{formatStoreAddress(s)}</td>
                <td className="p-3">
                  <Badge tone={s.active ? 'success' : 'danger'}>
                    {s.active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </td>
                <td className="p-3">
                  <TableActions>
                    <TableAction onClick={() => openEdit(s)}>Editar</TableAction>
                    {s.active ? (
                      <TableAction tone="muted" onClick={() => handleDeactivate(s)}>
                        Inativar
                      </TableAction>
                    ) : null}
                    <TableAction tone="danger" onClick={() => handleDelete(s)}>
                      Remover
                    </TableAction>
                  </TableActions>
                </td>
              </tr>
            ))}
            {pageStores.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  Nenhuma loja encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </PaginatedSection>

      <Modal
        open={modal === 'create'}
        onClose={closeModal}
        title="Nova loja"
        subtitle="Cadastre uma unidade da rede"
        size="lg"
      >
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
          <div>
            <Label>CNPJ</Label>
            <Input
              value={form.cnpj}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, cnpj: formatCnpj(e.target.value) })}
            />
          </div>
          <CustomerAddressFields
            value={form}
            onChange={(address) => setForm({ ...form, ...address })}
          />
          <div>
            <Label>Ponto de referência</Label>
            <Input
              value={form.landmark}
              onChange={(e) => setForm({ ...form, landmark: e.target.value })}
            />
          </div>
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
        title="Editar loja"
        subtitle={editing?.name}
        size="lg"
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
            <Label>Código</Label>
            <Input
              value={editForm.code}
              onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input
              value={editForm.cnpj}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              onChange={(e) => setEditForm({ ...editForm, cnpj: formatCnpj(e.target.value) })}
            />
          </div>
          <CustomerAddressFields
            value={editForm}
            onChange={(address) => setEditForm({ ...editForm, ...address })}
          />
          <div>
            <Label>Ponto de referência</Label>
            <Input
              value={editForm.landmark}
              onChange={(e) => setEditForm({ ...editForm, landmark: e.target.value })}
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
