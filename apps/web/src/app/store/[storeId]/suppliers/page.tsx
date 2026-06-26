'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { Pagination } from '@/components/pagination';
import { Button, Card, Input, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { SUPPLIER_TYPE_LABELS, type PaginatedResponse } from '@gas-erp/shared';

interface Supplier {
  id: string;
  type: string;
  legalName: string;
  tradeName?: string | null;
  document?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
}

const PAGE_SIZE = 20;

export default function SuppliersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
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
      const res = await api<PaginatedResponse<Supplier>>(
        `/suppliers?search=${encodeURIComponent(debouncedSearch)}&page=${page}&pageSize=${PAGE_SIZE}`,
        {},
        getToken(),
      );
      setSuppliers(res.data);
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
  }, [debouncedSearch, page]);

  async function handleDelete(supplier: Supplier) {
    if (!window.confirm(`Remover o fornecedor "${supplier.tradeName || supplier.legalName}"?`)) return;
    await api(`/suppliers/${supplier.id}`, { method: 'DELETE' }, getToken());
    load();
  }

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Fornecedores"
        subtitle="Cadastro de fornecedores da rede"
        action={
          <Button type="button" onClick={() => router.push(`/store/${storeId}/suppliers/new`)}>
            Novo fornecedor
          </Button>
        }
      />

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
              placeholder="Buscar fornecedor"
              className="pl-10"
              aria-label="Buscar fornecedor"
            />
          </div>
          {search ? (
            <Button type="button" variant="secondary" className="shrink-0" onClick={() => setSearch('')}>
              Limpar
            </Button>
          ) : null}
        </div>
        {loading && <p className="px-4 py-2 text-sm text-slate-500">Carregando...</p>}
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Fornecedor</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">CNPJ/CPF</th>
              <th className="p-3">Cidade</th>
              <th className="p-3">Telefone</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">
                  {s.tradeName || s.legalName}
                  {s.tradeName ? <div className="text-xs text-slate-500">{s.legalName}</div> : null}
                </td>
                <td className="p-3">{SUPPLIER_TYPE_LABELS[s.type] ?? s.type}</td>
                <td className="p-3">{s.document || '-'}</td>
                <td className="p-3">{s.city ? `${s.city}${s.state ? ` - ${s.state}` : ''}` : '-'}</td>
                <td className="p-3">{s.phone || '-'}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => router.push(`/store/${storeId}/suppliers/${s.id}`)}
                    >
                      Editar
                    </Button>
                    <Button type="button" variant="danger" onClick={() => handleDelete(s)}>
                      Remover
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-slate-400">
                  Nenhum fornecedor encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        <div className="border-t border-slate-100 px-4 py-3">
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </div>
      </Card>
    </>
  );
}
