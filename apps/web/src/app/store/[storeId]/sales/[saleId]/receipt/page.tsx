'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { PageLoader } from '@/components/brand-loader';
import { api, getToken } from '@/lib/api';
import { formatCnpj, formatCurrency } from '@/lib/utils';
import {
  getSaleAttendantName,
  formatSaleDateLabel,
} from '@gas-erp/shared';

interface ReceiptSale {
  id: string;
  createdAt: string;
  saleDate?: string;
  status: string;
  total: number | string;
  deliveryFee?: number | string | null;
  notes?: string | null;
  channel?: string;
  mobileApproval?: string;
  createdByDelivererId?: string | null;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryComplement?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryLandmark?: string | null;
  store?: {
    name: string;
    cnpj?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    address?: string | null;
  } | null;
  customer?: { name: string; phone?: string | null } | null;
  attendant?: { name: string } | null;
  createdByDeliverer?: { user: { name: string } } | null;
  deliverer?: { user: { name: string } } | null;
  items: {
    quantity: number;
    unitPrice: number | string;
    total?: number | string;
    product: { name: string };
  }[];
  payments: {
    method: string;
    amount: number | string;
    storePaymentMethod?: { label: string } | null;
  }[];
}

function toNum(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function storeAddressLines(store: ReceiptSale['store']): string[] {
  if (!store) return [];
  const line1 = [store.street, store.number].filter(Boolean).join(', ');
  const line2 = [store.neighborhood].filter(Boolean).join(', ');
  const line3 = [store.city, store.state].filter(Boolean).join(' - ');
  const composed = [line1, line2, line3].filter(Boolean);
  if (composed.length) return composed;
  return store.address ? [store.address] : [];
}

function deliveryAddress(sale: ReceiptSale): string | null {
  const line = [sale.deliveryStreet, sale.deliveryNumber].filter(Boolean).join(', ');
  const parts = [
    line,
    sale.deliveryComplement,
    sale.deliveryNeighborhood,
    [sale.deliveryCity, sale.deliveryState].filter(Boolean).join(' - '),
  ].filter(Boolean);
  const address = parts.join(', ');
  return address || null;
}

function delivererLabel(sale: ReceiptSale): string {
  if (sale.status === 'PORTARIA') return 'Portaria';
  if (sale.deliverer?.user?.name) return sale.deliverer.user.name;
  return 'Espera';
}

function formatDateTimeFull(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function SaleReceiptPage() {
  const { saleId } = useParams<{ storeId: string; saleId: string }>();
  const [sale, setSale] = useState<ReceiptSale | null>(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api<ReceiptSale>(`/sales/${saleId}`, {}, getToken())
      .then((data) => {
        if (!cancelled) setSale(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar a venda');
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  async function renderCanvas(): Promise<HTMLCanvasElement | null> {
    if (!paperRef.current) return null;
    return html2canvas(paperRef.current, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
  }

  async function handleDownloadPdf() {
    if (generating) return;
    setGenerating(true);
    try {
      const canvas = await renderCanvas();
      if (!canvas) return;
      const pageWidth = 80; // mm — largura de cupom
      const pageHeight = (canvas.height / canvas.width) * pageWidth;
      const pdf = new jsPDF({ unit: 'mm', format: [pageWidth, pageHeight] });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight);
      pdf.save(`cupom-${saleId}.pdf`);
    } catch {
      setError('Não foi possível gerar o PDF.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadPng() {
    if (generating) return;
    setGenerating(true);
    try {
      const canvas = await renderCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `cupom-${saleId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      setError('Não foi possível gerar a imagem.');
    } finally {
      setGenerating(false);
    }
  }

  if (error) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }
  if (!sale) {
    return <PageLoader label="Gerando cupom…" />;
  }

  const addressLines = storeAddressLines(sale.store);
  const delivery = deliveryAddress(sale);
  const attendant = getSaleAttendantName(sale);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex w-full max-w-[420px] items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Voltar
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={generating}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Baixar PNG
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={generating}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {generating ? 'Gerando…' : 'Baixar PDF'}
          </button>
        </div>
      </div>

      <div
        ref={paperRef}
        className="w-[302px] bg-white px-4 py-5 text-[11px] leading-tight text-black shadow-sm"
      >
        {/* Cabeçalho: logo + dados da loja */}
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-wordmark.png"
            alt={sale.store?.name ?? 'Logo'}
            className="mb-2 h-10 w-auto object-contain"
          />
        </div>

        <div className="mt-1 space-y-0.5 text-[10px]">
          <div className="font-bold uppercase">{sale.store?.name}</div>
          {addressLines.map((line, i) => (
            <div key={i} className="uppercase">{line}</div>
          ))}
          {sale.store?.cnpj && <div>CNPJ: {formatCnpj(sale.store.cnpj)}</div>}
        </div>

        <div className="mt-1 text-[10px] text-slate-700">{formatDateTimeFull(sale.createdAt)}</div>

        <div className="my-2 border-t border-dashed border-black" />

        <div className="font-bold">DADOS DA VENDA</div>
        <table className="mt-1 w-full text-[10px]">
          <thead>
            <tr className="text-left">
              <th className="w-8 py-0.5 font-semibold">QTD</th>
              <th className="py-0.5 font-semibold">DESCRIÇÃO</th>
              <th className="py-0.5 text-right font-semibold">VALOR</th>
              <th className="py-0.5 text-right font-semibold">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, i) => {
              const lineTotal = item.total != null ? toNum(item.total) : item.quantity * toNum(item.unitPrice);
              return (
                <tr key={i} className="align-top">
                  <td className="py-0.5">{item.quantity}</td>
                  <td className="py-0.5 pr-1 uppercase">{item.product.name}</td>
                  <td className="py-0.5 text-right">{formatCurrency(toNum(item.unitPrice))}</td>
                  <td className="py-0.5 text-right">{formatCurrency(lineTotal)}</td>
                </tr>
              );
            })}
            {toNum(sale.deliveryFee) > 0 && (
              <tr className="align-top">
                <td className="py-0.5">1</td>
                <td className="py-0.5 pr-1 uppercase">Taxa de entrega</td>
                <td className="py-0.5 text-right">{formatCurrency(toNum(sale.deliveryFee))}</td>
                <td className="py-0.5 text-right">{formatCurrency(toNum(sale.deliveryFee))}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="my-2 border-t border-dashed border-black" />

        <div className="flex items-center justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(toNum(sale.total))}</span>
        </div>

        <div className="mt-1 space-y-0.5 text-[10px]">
          {sale.payments.length > 0 ? (
            sale.payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <span>
                  {formatSaleDateLabel(sale.saleDate ?? sale.createdAt)}{' '}
                  {p.storePaymentMethod?.label ?? p.method}
                </span>
                <span>{formatCurrency(toNum(p.amount))}</span>
              </div>
            ))
          ) : (
            <div>{formatSaleDateLabel(sale.saleDate ?? sale.createdAt)}</div>
          )}
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        <div className="space-y-0.5 text-[10px]">
          {attendant && <div>Atendente: {attendant}</div>}
          <div>Entregador: {delivererLabel(sale)}</div>
          {sale.customer?.name && <div>Cliente: {sale.customer.name}</div>}
          {delivery && <div>Endereço: {delivery}</div>}
          {sale.customer?.phone && <div>Telefone(s): {sale.customer.phone}</div>}
          <div>Identificador da venda: {sale.id}</div>
        </div>
      </div>
    </div>
  );
}
