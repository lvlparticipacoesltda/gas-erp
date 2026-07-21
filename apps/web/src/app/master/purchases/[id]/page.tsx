'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageLoader } from '@/components/brand-loader';
import { Badge, Button, Card, Input, Label, PageHeader, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PURCHASE_INVOICE_STATUS_LABELS } from '@gas-erp/shared';

interface InvoiceItem {
  id: string;
  quantity: number;
  unitPrice: number | string;
  discount: number | string;
  total: number | string;
  product?: { name: string; sku: string } | null;
}

interface InvoicePayment {
  id: string;
  category: string;
  dueDate: string;
  amount: number | string;
  installment: number;
}

interface Invoice {
  id: string;
  number: string;
  issueDate: string;
  total: number | string;
  notes?: string | null;
  status: string;
  supplier?: { legalName: string; tradeName?: string | null; document?: string | null } | null;
  store?: { id: string; name: string } | null;
  items: InvoiceItem[];
  payments: InvoicePayment[];
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  return 'warning';
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

export default function MasterPurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const backHref = '/master/purchases';

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function applyInvoice(inv: Invoice) {
    setInvoice(inv);
    setNumber(inv.number);
    setIssueDate(dateKey(inv.issueDate));
    setNotes(inv.notes ?? '');
  }

  useEffect(() => {
    let cancelled = false;
    api<Invoice>(`/purchase-invoices/${id}`, {}, getToken())
      .then((res) => {
        if (!cancelled) applyInvoice(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar a compra');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const updated = await api<Invoice>(
        `/purchase-invoices/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ number: number.trim(), issueDate, notes: notes.trim() || undefined }),
        },
        getToken(),
      );
      applyInvoice(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancelar esta nota? O estoque dos itens será estornado.')) return;
    setError('');
    setCancelling(true);
    try {
      const updated = await api<Invoice>(`/purchase-invoices/${id}`, { method: 'DELETE' }, getToken());
      applyInvoice(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar');
    } finally {
      setCancelling(false);
    }
  }

  if (error && !invoice) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }

  if (!invoice) {
    return <PageLoader />;
  }

  const isCancelled = invoice.status === 'CANCELLED';
  const subtitleParts = [
    invoice.store?.name,
    invoice.supplier ? invoice.supplier.tradeName || invoice.supplier.legalName : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={`Compra ${invoice.number}`}
        subtitle={subtitleParts.length ? subtitleParts.join(' • ') : undefined}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(invoice.status)}>
              {PURCHASE_INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
            </Badge>
            <Button type="button" variant="secondary" onClick={() => router.push(backHref)}>
              Voltar
            </Button>
          </div>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Dados da compra</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Unidade</Label>
            <Input value={invoice.store?.name ?? '-'} disabled />
          </div>
          <div>
            <Label>Número</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} disabled={isCancelled} />
          </div>
          <div>
            <Label>Data da nota</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={isCancelled} />
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input value={invoice.supplier ? invoice.supplier.tradeName || invoice.supplier.legalName : '-'} disabled />
          </div>
        </div>
        <div className="mt-4">
          <Label>Observação</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isCancelled} />
        </div>
        {!isCancelled && (
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </Button>
            <Button type="button" variant="danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelando…' : 'Cancelar nota (estornar estoque)'}
            </Button>
          </div>
        )}
      </Card>

      <Card className="mb-6 p-0 overflow-hidden">
        <h2 className="px-6 pt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Itens</h2>
        <div className="p-6 pt-3">
          <Table>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Produto</th>
                <th className="p-3">Quantidade</th>
                <th className="p-3">Valor unitário</th>
                <th className="p-3">Desconto</th>
                <th className="p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="p-3">{it.product?.name ?? '-'}</td>
                  <td className="p-3">{it.quantity}</td>
                  <td className="p-3">{formatCurrency(it.unitPrice)}</td>
                  <td className="p-3">{formatCurrency(it.discount)}</td>
                  <td className="p-3">{formatCurrency(it.total)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="p-3" colSpan={4}>
                  Total
                </td>
                <td className="p-3">{formatCurrency(invoice.total)}</td>
              </tr>
            </tbody>
          </Table>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <h2 className="px-6 pt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Pagamentos</h2>
        <div className="p-6 pt-3">
          <Table>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Parcela</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Data de pagamento</th>
                <th className="p-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="p-3">{p.installment}</td>
                  <td className="p-3">{p.category}</td>
                  <td className="p-3">{formatDate(p.dueDate)}</td>
                  <td className="p-3">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
              {invoice.payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-slate-400">
                    Sem parcelas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>
    </>
  );
}
