'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { PaginatedSection } from '@/components/paginated-section';
import { Badge, Button, Card, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PURCHASE_INVOICE_STATUS_LABELS, type PaginatedResponse } from '@gas-erp/shared';

interface PurchaseInvoice {
  id: string;
  number: string;
  issueDate: string;
  total: number | string;
  status: string;
  supplier?: { legalName: string; tradeName?: string | null } | null;
}

const PAGE_SIZE = 20;

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  return 'warning';
}

export default function PurchasesPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const router = useRouter();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    api<PaginatedResponse<PurchaseInvoice>>(
      `/purchase-invoices?storeId=${storeId}&page=${page}&pageSize=${PAGE_SIZE}`,
      {},
      getToken(),
    )
      .then((res) => {
        setInvoices(res.data);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, [storeId, page]);

  if (!ready) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="Compras"
        subtitle="Notas fiscais de entrada e fornecedores"
        action={
          <Link href={`/store/${storeId}/purchases/new`}>
            <Button>Nova compra</Button>
          </Link>
        }
      />

      <Card className="overflow-hidden p-0">
        <PaginatedSection
          loading={loading}
          pagination={{
            className: 'border-t border-slate-100 px-4 py-3',
            page,
            totalPages,
            total,
            pageSize: PAGE_SIZE,
            onPageChange: setPage,
          }}
        >
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Data da nota</th>
              <th className="p-3">Número</th>
              <th className="p-3">Fornecedor</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-slate-100">
                <td className="p-3">{formatDate(inv.issueDate)}</td>
                <td className="p-3">{inv.number}</td>
                <td className="p-3">
                  {inv.supplier ? inv.supplier.tradeName || inv.supplier.legalName : '-'}
                </td>
                <td className="p-3">{formatCurrency(inv.total)}</td>
                <td className="p-3">
                  <Badge tone={statusTone(inv.status)}>
                    {PURCHASE_INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                  </Badge>
                </td>
                <td className="p-3 text-right">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => router.push(`/store/${storeId}/purchases/${inv.id}`)}
                  >
                    Ver / editar
                  </Button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-slate-400">
                  Nenhuma compra registrada.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        </PaginatedSection>
      </Card>
    </>
  );
}
