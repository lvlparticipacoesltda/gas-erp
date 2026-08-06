'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { PaginatedSection } from '@/components/paginated-section';
import { Modal } from '@/components/modal';
import { useConfirm } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import {
  CustomerAddressFields,
  type CustomerAddressForm,
} from '@/components/customer-address-fields';
import { api, getToken } from '@/lib/api';
import { formatPhoneDisplay, type CustomerAddress } from '@/lib/customer-display';
import type { PaginatedResponse } from '@gas-erp/shared';

interface VasilhameLoan {
  id: string;
  customerId?: string | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
  responsibleName: string;
  responsiblePhone?: string | null;
  street: string;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city: string;
  state: string;
  zipCode?: string | null;
  quantity: number;
  notes?: string | null;
}

interface CustomerOption {
  id: string;
  name: string;
  phone?: string | null;
  addresses: CustomerAddress[];
}

type LoansResponse = PaginatedResponse<VasilhameLoan> & { totalQuantity: number };

const PAGE_SIZE = 20;

const EMPTY_ADDRESS: CustomerAddressForm = {
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: 'SP',
};

interface LoanForm {
  customerId: string;
  responsibleName: string;
  responsiblePhone: string;
  quantity: string;
  notes: string;
  address: CustomerAddressForm;
}

const EMPTY_FORM: LoanForm = {
  customerId: '',
  responsibleName: '',
  responsiblePhone: '',
  quantity: '1',
  notes: '',
  address: EMPTY_ADDRESS,
};

function formToPayload(form: LoanForm, storeId: string) {
  return {
    storeId,
    customerId: form.customerId || undefined,
    responsibleName: form.responsibleName.trim(),
    responsiblePhone: form.responsiblePhone.trim() || undefined,
    street: form.address.street.trim(),
    number: form.address.number.trim() || undefined,
    complement: form.address.complement.trim() || undefined,
    neighborhood: form.address.neighborhood.trim() || undefined,
    city: form.address.city.trim(),
    state: form.address.state.trim().toUpperCase(),
    zipCode: form.address.zipCode.replace(/\D/g, '') || undefined,
    quantity: Number(form.quantity),
    notes: form.notes.trim() || undefined,
  };
}

function formFromLoan(loan: VasilhameLoan): LoanForm {
  return {
    customerId: loan.customerId ?? '',
    responsibleName: loan.responsibleName,
    responsiblePhone: loan.responsiblePhone ?? '',
    quantity: String(loan.quantity),
    notes: loan.notes ?? '',
    address: {
      zipCode: loan.zipCode ?? '',
      street: loan.street,
      number: loan.number ?? '',
      complement: loan.complement ?? '',
      neighborhood: loan.neighborhood ?? '',
      city: loan.city,
      state: loan.state,
    },
  };
}

function formatLoanAddress(loan: VasilhameLoan): string {
  const streetLine = [loan.street, loan.number].filter(Boolean).join(', ');
  const cityLine = [loan.city, loan.state].filter(Boolean).join(' - ');
  return [streetLine, loan.complement, cityLine].filter(Boolean).join(' · ');
}

export default function VasilhameLoansPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const confirm = useConfirm();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LoansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const [editing, setEditing] = useState<VasilhameLoan | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<LoanForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        storeId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      setResult(await api<LoansResponse>(`/vasilhame-loans?${params}`, {}, getToken()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar empréstimos');
    } finally {
      setLoading(false);
      setReady(true);
    }
    // `toast` é estável no provider; incluí-lo recarregaria a lista a cada toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, page, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const loans = result?.data ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(loan: VasilhameLoan) {
    setEditing(loan);
    setForm(formFromLoan(loan));
    setFormError('');
    setFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');

    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setFormError('Informe uma quantidade inteira maior que zero.');
      return;
    }
    if (!form.responsibleName.trim()) {
      setFormError('Informe o responsável pelos vasilhames.');
      return;
    }
    if (!form.address.street.trim() || !form.address.city.trim()) {
      setFormError('Informe pelo menos rua e cidade do endereço.');
      return;
    }

    setSaving(true);
    try {
      const payload = formToPayload(form, storeId);
      if (editing) {
        const { storeId: _storeId, ...body } = payload;
        await api(
          `/vasilhame-loans/${editing.id}`,
          { method: 'PATCH', body: JSON.stringify(body) },
          getToken(),
        );
        toast.success('Empréstimo atualizado.', form.responsibleName.trim());
      } else {
        await api(
          '/vasilhame-loans',
          { method: 'POST', body: JSON.stringify(payload) },
          getToken(),
        );
        toast.success('Empréstimo registrado.', form.responsibleName.trim());
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar empréstimo');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(loan: VasilhameLoan) {
    const ok = await confirm({
      title: `Remover empréstimo de ${loan.responsibleName}`,
      description: 'Use ao receber todos os vasilhames de volta. A ação não pode ser desfeita.',
      confirmLabel: 'Remover',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/vasilhame-loans/${loan.id}`, { method: 'DELETE' }, getToken());
      toast.success('Empréstimo removido.', loan.responsibleName);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover empréstimo');
    }
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Vasilhames emprestados"
        subtitle="Controle de vasilhames em comodato: endereço, responsável e quantidade"
        action={
          <Button type="button" onClick={openCreate}>
            Novo empréstimo
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-brand/40 bg-brand/5">
          <div className="text-sm text-slate-500">Vasilhames emprestados na unidade</div>
          <div className="text-3xl font-extrabold text-brand-dark tabular-nums">
            {result?.totalQuantity ?? 0}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Endereços com vasilhame</div>
          <div className="text-3xl font-extrabold tabular-nums">{result?.total ?? 0}</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por responsável, cliente ou endereço"
            className="w-full max-w-sm"
            aria-label="Buscar empréstimo"
          />
          {search ? (
            <Button type="button" variant="secondary" onClick={() => setSearch('')}>
              Limpar
            </Button>
          ) : null}
        </div>

        <PaginatedSection
          loading={loading}
          pagination={{
            className: 'border-t border-slate-100 px-4 py-3',
            page,
            totalPages: result?.totalPages ?? 1,
            total: result?.total ?? 0,
            pageSize: PAGE_SIZE,
            onPageChange: setPage,
          }}
        >
          <Table>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Responsável</th>
                <th className="p-3">Endereço</th>
                <th className="p-3">Bairro</th>
                <th className="p-3 text-right">Vasilhames</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <div className="font-medium">{loan.responsibleName}</div>
                    {loan.customer ? (
                      <div className="text-xs text-slate-500">Cliente: {loan.customer.name}</div>
                    ) : null}
                    {loan.responsiblePhone ? (
                      <div className="text-xs text-slate-500">
                        {formatPhoneDisplay(loan.responsiblePhone)}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3 text-sm">{formatLoanAddress(loan)}</td>
                  <td className="p-3 text-sm">{loan.neighborhood || '—'}</td>
                  <td className="p-3 text-right text-lg font-bold tabular-nums">{loan.quantity}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={() => openEdit(loan)}>
                        Editar
                      </Button>
                      <Button type="button" variant="danger" onClick={() => handleDelete(loan)}>
                        Remover
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-slate-400">
                    Nenhum vasilhame emprestado registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </PaginatedSection>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar empréstimo' : 'Novo empréstimo'}
        subtitle="Vincule um cliente para preencher endereço e responsável automaticamente."
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <CustomerLinkField
            storeId={storeId}
            customerId={form.customerId}
            customerName={editing?.customer?.name ?? ''}
            onPick={(customer) => {
              if (!customer) {
                setForm((f) => ({ ...f, customerId: '' }));
                return;
              }
              const addr = customer.addresses[0];
              setForm((f) => ({
                ...f,
                customerId: customer.id,
                responsibleName: f.responsibleName || customer.name,
                responsiblePhone: f.responsiblePhone || (customer.phone ?? ''),
                address: addr
                  ? {
                      zipCode: addr.zipCode ?? '',
                      street: addr.street ?? '',
                      number: addr.number ?? '',
                      complement: addr.complement ?? '',
                      neighborhood: addr.neighborhood ?? '',
                      city: addr.city ?? '',
                      state: addr.state ?? 'SP',
                    }
                  : f.address,
              }));
            }}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Responsável</Label>
              <Input
                value={form.responsibleName}
                onChange={(e) => setForm((f) => ({ ...f, responsibleName: e.target.value }))}
                placeholder="Quem responde pelos vasilhames"
                data-modal-focus="responsible"
                required
              />
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <Label>Telefone do responsável</Label>
            <Input
              value={form.responsiblePhone}
              onChange={(e) => setForm((f) => ({ ...f, responsiblePhone: e.target.value }))}
              placeholder="(13) 99999-0000"
            />
          </div>

          <CustomerAddressFields
            value={form.address}
            onChange={(address) => setForm((f) => ({ ...f, address }))}
          />

          <div>
            <Label>Observações</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ex.: 2 botijões deixados na portaria"
            />
          </div>

          {formError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Registrar empréstimo'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Busca de cliente para pré-preencher responsável e endereço. Vínculo é opcional. */
function CustomerLinkField({
  storeId,
  customerId,
  customerName,
  onPick,
}: {
  storeId: string;
  customerId: string;
  customerName: string;
  onPick: (customer: CustomerOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedName, setPickedName] = useState(customerName);

  useEffect(() => {
    setPickedName(customerName);
  }, [customerName]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    api<PaginatedResponse<CustomerOption>>(
      `/customers?storeId=${storeId}&search=${encodeURIComponent(debounced)}&pageSize=8`,
      {},
      getToken(),
    )
      .then((res) => {
        if (!cancelled) setOptions(res.data);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, storeId]);

  const linked = useMemo(() => Boolean(customerId), [customerId]);

  if (linked) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand/5 px-3 py-2">
        <div className="min-w-0 text-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Cliente vinculado</div>
          <div className="truncate font-medium">{pickedName || 'Cliente selecionado'}</div>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setPickedName('');
            setQuery('');
            onPick(null);
          }}
        >
          Desvincular
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Label>Cliente (opcional)</Label>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar cliente cadastrado para preencher os dados"
      />
      {debounced.length >= 2 ? (
        <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
          {searching && options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">Buscando…</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">
              Nenhum cliente encontrado — preencha os campos abaixo à mão.
            </p>
          ) : (
            options.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => {
                  setPickedName(customer.name);
                  setQuery('');
                  onPick(customer);
                }}
                className="block w-full px-3 py-2 text-left text-sm transition hover:bg-slate-50"
              >
                <span className="font-medium">{customer.name}</span>
                {customer.phone ? (
                  <span className="ml-2 text-xs text-slate-500">
                    {formatPhoneDisplay(customer.phone)}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
