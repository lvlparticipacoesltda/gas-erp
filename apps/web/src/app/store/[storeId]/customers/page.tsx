'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BrandLoader, PageLoader } from '@/components/brand-loader';
import { CustomerAddressFields, customerAddressPayload, type CustomerAddressForm } from '@/components/customer-address-fields';
import { CustomerProductPricesEditor } from '@/components/customer-product-prices-editor';
import { LoadingOverlay } from '@/components/loading-overlay';
import { Pagination } from '@/components/pagination';
import { Badge, Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatSaleAddress } from '@/lib/sale-utils';
import { getSaleDisplayStatus, type PaginatedResponse } from '@gas-erp/shared';

interface CustomerAddress {
  id?: string;
  street: string;
  number?: string;
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
}

interface CustomerForm extends CustomerAddressForm {
  name: string;
  phone: string;
  document: string;
}

const emptyForm: CustomerForm = {
  name: '',
  phone: '',
  document: '',
  zipCode: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: 'SP',
};

const PAGE_SIZE = 20;
const HISTORY_PAGE_SIZE = 10;

function addressFromCustomer(addr?: CustomerAddress): CustomerAddressForm {
  return {
    zipCode: addr?.zipCode ?? '',
    street: addr?.street ?? '',
    number: addr?.number ?? '',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Histórico de pedidos</h2>
          <p className="mt-1 text-sm text-slate-500">{customer.name}</p>
        </div>

        <div className="overflow-y-auto px-6 py-4">
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
                            <dd>{sale.deliverer?.user.name ?? '—'}</dd>
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
        </div>

        <div className="border-t border-slate-100 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  async function load() {
    setLoading(true);
    try {
      const res = await api<PaginatedResponse<Customer>>(
        `/customers?search=${encodeURIComponent(debouncedSearch)}&page=${page}&pageSize=${PAGE_SIZE}`,
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
  }, [debouncedSearch, page]);

  function startEdit(customer: Customer) {
    const addr = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0];
    setFormError('');
    setEditing(customer);
    setEditForm({
      name: customer.name,
      phone: customer.phone ?? '',
      document: customer.document ?? '',
      ...addressFromCustomer(addr),
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    try {
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          document: form.document,
          addresses: [buildAddressPayload(form)],
        }),
      }, getToken());
      setForm(emptyForm);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar cliente');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError('');
    try {
      await api(`/customers/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          document: editForm.document,
          addresses: [buildAddressPayload(editForm)],
        }),
      }, getToken());
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar cliente');
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
      <PageHeader title="Clientes" subtitle="Cadastro e busca de clientes da rede" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
          {formError && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          )}
          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-3">
              {identityFields(editForm, setEditForm)}
              <CustomerAddressFields
                value={editForm}
                onChange={(address) => setEditForm({ ...editForm, ...address })}
              />
              <CustomerProductPricesEditor customerId={editing.id} storeId={storeId} />
              <div className="flex gap-2 pt-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="secondary" onClick={() => { setEditing(null); setFormError(''); }}>Cancelar</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              {identityFields(form, setForm)}
              <CustomerAddressFields
                value={form}
                onChange={(address) => setForm({ ...form, ...address })}
              />
              <Button type="submit" className="mt-2">Cadastrar</Button>
            </form>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div className="relative w-full max-w-xs">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
              </svg>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente"
                className="pl-10"
                aria-label="Buscar cliente"
              />
            </div>
            {search ? (
              <Button type="button" variant="secondary" className="shrink-0" onClick={() => setSearch('')}>
                Limpar
              </Button>
            ) : null}
          </div>
          <LoadingOverlay loading={loading} label="Carregando…">
          <Table>
            <thead className="bg-slate-50 text-left">
              <tr><th className="p-3">Nome</th><th className="p-3">Telefone</th><th className="p-3">Endereço</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{c.phone ?? '-'}</td>
                  <td className="p-3">{c.addresses[0] ? `${c.addresses[0].street}, ${c.addresses[0].city}` : '-'}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={() => setHistoryCustomer(c)}>
                        Histórico
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => startEdit(c)}>Editar</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-slate-400">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          </LoadingOverlay>
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} loading={loading} onPageChange={setPage} />
          </div>
        </Card>
      </div>

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
