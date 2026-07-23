'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { BrandLoader, PageLoader } from '@/components/brand-loader';
import { CustomerAddressFields, customerAddressPayload, type CustomerAddressForm } from '@/components/customer-address-fields';
import { CustomerProductPricesEditor } from '@/components/customer-product-prices-editor';
import { FilterPanel } from '@/components/filter-panel';
import { LoadingOverlay } from '@/components/loading-overlay';
import { Modal } from '@/components/modal';
import { PaginatedSection } from '@/components/paginated-section';
import { DEFAULT_TABLE_PAGE_SIZE, Pagination } from '@/components/pagination';
import { TableAction, TableActions } from '@/components/table-actions';
import { Badge, Button, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatSaleAddress } from '@/lib/sale-utils';
import {
  getSaleDisplayStatus,
  getSaleDelivererName,
  PAYMENT_METHOD_LABELS,
  type PaginatedResponse,
} from '@gas-erp/shared';

interface CustomerAddress {
  id?: string;
  street: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode?: string;
  isDefault?: boolean;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  document?: string;
  active?: boolean;
  addresses: CustomerAddress[];
}

interface CustomerSale {
  id: string;
  createdAt: string;
  status: string;
  total: number | string;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryLandmark?: string | null;
  attendant?: { name: string } | null;
  deliverer?: { user: { name: string } } | null;
  items: { quantity: number; product: { name: string } }[];
  payments?: {
    amount: number | string;
    method: string;
    storePaymentMethod?: { label: string; systemCode?: string | null } | null;
  }[] | null;
}

function formatSalePayments(sale: CustomerSale): string {
  if (!sale.payments || sale.payments.length === 0) return '';
  const labels = Array.from(
    new Set(
      sale.payments.map(
        (p) => p.storePaymentMethod?.label ?? PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      ),
    ),
  );
  return labels.join(', ');
}

interface CustomerForm extends CustomerAddressForm {
  name: string;
  phone: string;
  document: string;
  active: boolean;
}

const emptyForm: CustomerForm = {
  name: '',
  phone: '',
  document: '',
  active: true,
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: 'SP',
};

const HISTORY_PAGE_SIZE = 10;

function addressFromCustomer(addr?: CustomerAddress): CustomerAddressForm {
  return {
    zipCode: addr?.zipCode ?? '',
    street: addr?.street ?? '',
    number: addr?.number ?? '',
    complement: addr?.complement ?? '',
    neighborhood: addr?.neighborhood ?? '',
    city: addr?.city ?? '',
    state: addr?.state ?? 'SP',
  };
}

function buildAddressPayload(form: CustomerForm) {
  return customerAddressPayload(form);
}

function CustomerHistoryModal({
  customer,
  storeId,
  onClose,
}: {
  customer: Customer;
  storeId: string;
  onClose: () => void;
}) {
  const [sales, setSales] = useState<CustomerSale[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api<{ sales: PaginatedResponse<CustomerSale> }>(
      `/customers/${customer.id}?storeId=${storeId}&page=${page}&pageSize=${HISTORY_PAGE_SIZE}`,
      {},
      getToken(),
    )
      .then((res) => {
        if (!cancelled) {
          setSales(res.sales.data);
          setTotalPages(res.sales.totalPages);
          setTotal(res.sales.total);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar histórico');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer.id, storeId, page]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Histórico de pedidos"
      subtitle={customer.name}
      size="xl"
    >
      {loading && sales.length === 0 && !error && (
        <div className="flex justify-center py-10">
          <BrandLoader size="md" label="Carregando pedidos…" />
        </div>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!error && sales.length === 0 && !loading && (
        <p className="text-sm text-slate-500">Nenhum pedido encontrado para este cliente nesta unidade.</p>
      )}
      {!error && sales.length > 0 && (
        <LoadingOverlay loading={loading} label="Carregando…" minHeight="min-h-[10rem]">
          <ul className="space-y-3">
            {sales.map((sale) => {
              const display = getSaleDisplayStatus(sale);
              const itemsSummary = sale.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
              const address = formatSaleAddress(sale);
              const payments = formatSalePayments(sale);
              return (
                <li key={sale.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{formatDate(sale.createdAt)}</p>
                      <p className="mt-1 text-sm text-slate-600">{itemsSummary || 'Sem itens'}</p>
                      <dl className="mt-3 space-y-1 text-sm text-slate-600">
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-slate-500">Atendente:</dt>
                          <dd>{sale.attendant?.name ?? '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-slate-500">Entregador:</dt>
                          <dd>{getSaleDelivererName(sale) ?? '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-slate-500">Pagamento:</dt>
                          <dd>{payments || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-slate-500">Endereço:</dt>
                          <dd>{address || '—'}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge tone={display.tone}>{display.label}</Badge>
                      <span className="font-semibold text-slate-900">{formatCurrency(sale.total)}</span>
                      <Link href={`/store/${storeId}/sales/${sale.id}`}>
                        <Button type="button" variant="secondary">Ver pedido</Button>
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </LoadingOverlay>
      )}
      {!error && total > 0 && (
        <Pagination
          className="mt-4"
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={HISTORY_PAGE_SIZE}
          loading={loading}
          onPageChange={setPage}
        />
      )}
      <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}

export default function CustomersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        storeId,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
      const res = await api<PaginatedResponse<Customer>>(
        `/customers?${params}`,
        {},
        getToken(),
      );
      setCustomers(res.data);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, page, pageSize, appliedSearch]);

  function applyFilters() {
    setPage(1);
    setAppliedSearch(draftSearch);
  }

  function resetFilters() {
    setDraftSearch('');
    setPage(1);
    setAppliedSearch('');
  }

  function openCreate() {
    setFormError('');
    setForm(emptyForm);
    setEditing(null);
    setModal('create');
  }

  function openEdit(customer: Customer) {
    const addr = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0];
    setFormError('');
    setEditing(customer);
    setEditForm({
      name: customer.name,
      phone: customer.phone ?? '',
      document: customer.document ?? '',
      active: customer.active ?? true,
      ...addressFromCustomer(addr),
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
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          name: form.name,
          phone: form.phone,
          document: form.document,
          addresses: [buildAddressPayload(form)],
        }),
      }, getToken());
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar cliente');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(customer: Customer) {
    if (customer.active === false) return;
    if (
      !window.confirm(
        `Inativar o cliente "${customer.name}"?\n\nEle deixará de aparecer nas buscas, mas o histórico de pedidos será mantido.`,
      )
    ) {
      return;
    }
    setFormError('');
    try {
      await api(`/customers/${customer.id}?storeId=${storeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      }, getToken());
      if (editing?.id === customer.id) closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao inativar cliente');
    }
  }

  async function handleDelete(customer: Customer) {
    if (
      !window.confirm(
        `Excluir permanentemente o cliente "${customer.name}"?\n\nEsta ação não pode ser desfeita. O cadastro será removido do sistema.`,
      )
    ) {
      return;
    }
    setFormError('');
    try {
      await api(`/customers/${customer.id}?storeId=${storeId}`, { method: 'DELETE' }, getToken());
      if (editing?.id === customer.id) closeModal();
      if (historyCustomer?.id === customer.id) setHistoryCustomer(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao excluir cliente');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    if (editing.active !== false && !editForm.active) {
      const ok = confirm(
        `Inativar o cliente "${editing.name}"?\n\nEle deixará de aparecer nas buscas, mas o histórico de pedidos será mantido.`,
      );
      if (!ok) return;
    }

    setFormError('');
    setSaving(true);
    try {
      await api(`/customers/${editing.id}?storeId=${storeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          document: editForm.document,
          active: editForm.active,
          addresses: [buildAddressPayload(editForm)],
        }),
      }, getToken());
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar cliente');
    } finally {
      setSaving(false);
    }
  }

  function identityFields(value: CustomerForm, onChange: (v: CustomerForm) => void) {
    return (
      <>
        <div>
          <Label>Nome</Label>
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Telefone</Label>
            <Input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <Label>CPF/CNPJ</Label>
            <Input value={value.document} onChange={(e) => onChange({ ...value, document: e.target.value })} />
          </div>
        </div>
      </>
    );
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader title="Clientes" subtitle="Cadastro e busca de clientes desta unidade" />

      <FilterPanel onSearch={applyFilters} onReset={resetFilters} searching={loading}>
        <div>
          <Label>Nome, telefone ou documento</Label>
          <Input
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="Buscar cliente"
          />
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
              <th className="p-3">Telefone</th>
              <th className="p-3 min-w-[14rem]">Endereço</th>
              <th className="p-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">{c.name}</td>
                <td className="p-3">{c.phone ?? '—'}</td>
                <td className="p-3 text-slate-600">
                  {c.addresses[0] ? `${c.addresses[0].street}, ${c.addresses[0].city}` : '—'}
                </td>
                <td className="p-3">
                  <TableActions>
                    <TableAction tone="muted" onClick={() => setHistoryCustomer(c)}>
                      Histórico
                    </TableAction>
                    <TableAction onClick={() => openEdit(c)}>Editar</TableAction>
                    {c.active !== false ? (
                      <TableAction tone="muted" onClick={() => handleDeactivate(c)}>
                        Inativar
                      </TableAction>
                    ) : null}
                    <TableAction tone="danger" onClick={() => handleDelete(c)}>
                      Remover
                    </TableAction>
                  </TableActions>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </PaginatedSection>

      <Modal
        open={modal === 'create'}
        onClose={closeModal}
        title="Novo cliente"
        subtitle="Cadastre um cliente nesta unidade"
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          {identityFields(form, setForm)}
          <CustomerAddressFields
            value={form}
            onChange={(address) => setForm({ ...form, ...address })}
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
        title="Editar cliente"
        subtitle={editing?.name}
        size="xl"
      >
        <form onSubmit={handleUpdate} className="space-y-3">
          {identityFields(editForm, setEditForm)}
          <CustomerAddressFields
            value={editForm}
            onChange={(address) => setEditForm({ ...editForm, ...address })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.active}
              onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
            />
            Cliente ativo (desmarque para inativar nas buscas)
          </label>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar cliente'}
            </Button>
          </div>
        </form>
        {editing ? (
          <CustomerProductPricesEditor customerId={editing.id} storeId={storeId} />
        ) : null}
      </Modal>

      {historyCustomer && (
        <CustomerHistoryModal
          customer={historyCustomer}
          storeId={storeId}
          onClose={() => setHistoryCustomer(null)}
        />
      )}
    </>
  );
}
