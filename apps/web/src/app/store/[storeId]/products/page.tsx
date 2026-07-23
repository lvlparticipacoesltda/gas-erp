'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageLoader } from '@/components/brand-loader';
import { FilterPanel } from '@/components/filter-panel';
import { Modal } from '@/components/modal';
import { PaginatedSection } from '@/components/paginated-section';
import { DEFAULT_TABLE_PAGE_SIZE } from '@/components/pagination';
import { TableAction, TableActions } from '@/components/table-actions';
import { Button, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  productTypeRequiresVasilhame,
  type PaginatedResponse,
} from '@gas-erp/shared';

interface Product {
  id: string;
  sku: string;
  name: string;
  productType: string;
  vasilhameProductId?: string | null;
  storeSettings?: { price: number | string; supplierCost?: number | string; deliveryFee?: number | string }[];
  stockBalances?: { available: number; inTransit: number; lent: number }[];
}

const emptyForm = {
  sku: '',
  name: '',
  productType: 'GLP',
  vasilhameProductId: '',
  price: 0,
  supplierCost: 0,
  deliveryFee: 0,
};

function parsePrice(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ProductsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [vasilhameOptions, setVasilhameOptions] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftSearch, setDraftSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        storeId,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
      const res = await api<PaginatedResponse<Product>>(
        `/products?${params}`,
        {},
        getToken(),
      );
      setProducts(res.data);
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

  useEffect(() => {
    api<PaginatedResponse<Product>>(`/products?pageSize=200`, {}, getToken())
      .then((res) =>
        setVasilhameOptions(res.data.filter((p) => !productTypeRequiresVasilhame(p.productType))),
      )
      .catch(() => setVasilhameOptions([]));
  }, [storeId]);

  function openCreate() {
    setFormError('');
    setForm(emptyForm);
    setEditing(null);
    setModal('create');
  }

  function openEdit(product: Product) {
    setFormError('');
    setEditing(product);
    setEditForm({
      sku: product.sku,
      name: product.name,
      productType: product.productType,
      vasilhameProductId: product.vasilhameProductId ?? '',
      price: parsePrice(product.storeSettings?.[0]?.price),
      supplierCost: parsePrice(product.storeSettings?.[0]?.supplierCost),
      deliveryFee: parsePrice(product.storeSettings?.[0]?.deliveryFee),
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
      await api(`/products?storeId=${storeId}`, {
        method: 'POST',
        body: JSON.stringify({ ...form, vasilhameProductId: form.vasilhameProductId || null }),
      }, getToken());
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar produto');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError('');
    setSaving(true);
    try {
      await api(`/products/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sku: editForm.sku,
          name: editForm.name,
          productType: editForm.productType,
          vasilhameProductId: editForm.vasilhameProductId || null,
        }),
      }, getToken());
      await api(`/products/${editing.id}/price`, {
        method: 'PATCH',
        body: JSON.stringify({
          storeId,
          price: editForm.price,
          supplierCost: editForm.supplierCost,
          deliveryFee: editForm.deliveryFee,
        }),
      }, getToken());
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar produto');
    } finally {
      setSaving(false);
    }
  }

  const formFields = (value: typeof emptyForm, onChange: (v: typeof emptyForm) => void) => (
    <>
      <div><Label>SKU</Label><Input value={value.sku} onChange={(e) => onChange({ ...value, sku: e.target.value })} required /></div>
      <div><Label>Nome</Label><Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required /></div>
      <div><Label>Tipo</Label><Input value={value.productType} onChange={(e) => onChange({ ...value, productType: e.target.value })} /></div>
      {productTypeRequiresVasilhame(value.productType) && (
        <div>
          <Label>Vasilhame correspondente</Label>
          <Select
            value={value.vasilhameProductId}
            onChange={(e) => onChange({ ...value, vasilhameProductId: e.target.value })}
          >
            <option value="">Selecione o vasilhame</option>
            {vasilhameOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            Necessário para lançar entradas de botijões (trava pelo estoque de vasilhames).
          </p>
        </div>
      )}
      <div><Label>Preço nesta loja</Label><Input type="number" step="0.01" value={value.price} onChange={(e) => onChange({ ...value, price: Number(e.target.value) })} /></div>
      <div><Label>Custo fornecedor</Label><Input type="number" step="0.01" min="0" value={value.supplierCost} onChange={(e) => onChange({ ...value, supplierCost: Number(e.target.value) })} /></div>
      <div><Label>Taxa entrega / Gás do Povo</Label><Input type="number" step="0.01" min="0" value={value.deliveryFee} onChange={(e) => onChange({ ...value, deliveryFee: Number(e.target.value) })} /></div>
    </>
  );

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader title="Produtos" subtitle="Catálogo e preços por loja" />

      <FilterPanel
        onSearch={() => {
          setPage(1);
          setAppliedSearch(draftSearch);
        }}
        onReset={() => {
          setDraftSearch('');
          setPage(1);
          setAppliedSearch('');
        }}
        searching={loading}
      >
        <div>
          <Label>Nome ou SKU</Label>
          <Input
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="Buscar produto"
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
              <th className="p-3">Produto</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Preço</th>
              <th className="p-3">Custo</th>
              <th className="p-3">Taxa entrega</th>
              <th className="p-3">Disponível</th>
              <th className="p-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">
                  {p.name}
                  <div className="text-xs text-slate-500">{p.sku}</div>
                </td>
                <td className="p-3">{p.productType}</td>
                <td className="p-3">{formatCurrency(p.storeSettings?.[0]?.price ?? 0)}</td>
                <td className="p-3">{formatCurrency(p.storeSettings?.[0]?.supplierCost ?? 0)}</td>
                <td className="p-3">{formatCurrency(p.storeSettings?.[0]?.deliveryFee ?? 0)}</td>
                <td className="p-3">{p.stockBalances?.[0]?.available ?? 0}</td>
                <td className="p-3">
                  <TableActions>
                    <TableAction onClick={() => openEdit(p)}>Editar</TableAction>
                  </TableActions>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </PaginatedSection>

      <Modal
        open={modal === 'create'}
        onClose={closeModal}
        title="Novo produto"
        subtitle="Cadastre no catálogo desta unidade"
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          ) : null}
          {formFields(form, setForm)}
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
        title="Editar produto"
        subtitle={editing?.name}
        size="lg"
      >
        <form onSubmit={handleUpdate} className="space-y-3">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          ) : null}
          {formFields(editForm, setEditForm)}
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
