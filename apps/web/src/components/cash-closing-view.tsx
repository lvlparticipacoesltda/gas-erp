'use client';

import { Printer } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { DailySummaryData } from '@/components/daily-summary-content';

const TYPE_LABELS: Record<string, string> = {
  GLP: 'Gás (GLP)',
  CANISTER: 'Vasilhames',
  VASILHAME: 'Vasilhames',
  VASILHAMES: 'Vasilhames',
  AGUA: 'Água',
  'ÁGUA': 'Água',
  WATER: 'Água',
  ACESSORIO: 'Acessórios',
  'ACESSÓRIO': 'Acessórios',
  ACESSORIOS: 'Acessórios',
  'ACESSÓRIOS': 'Acessórios',
  ACCESSORY: 'Acessórios',
  TAXA: 'Taxas',
  TAXAS: 'Taxas',
  OUTROS: 'Outros',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type.toUpperCase()] ?? type;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-avoid-break">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

function SheetTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function CashClosingView({
  data,
  title,
  subtitle,
}: {
  data: DailySummaryData;
  title: string;
  subtitle?: string;
}) {
  const stockGroups = data.stockAll?.groups ?? [];
  const portaria = data.portariaDetail;
  const payments = data.paymentsByMethod;
  const deliveries = data.deliveries;

  return (
    <div className="print-area mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-900">Fechamento de Caixa</h2>
          <p className="text-sm text-slate-500">
            {title}
            {subtitle ? ` · ${subtitle}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="print-hide inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </button>
      </div>

      <div className="space-y-6">
        {stockGroups.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum produto com movimentação de estoque.</p>
        ) : (
          stockGroups.map((group) => (
            <Section key={group.type} title={typeLabel(group.type)}>
              <SheetTable>
                <thead className="bg-slate-100 text-left">
                  <tr>
                    <th className="border-b border-slate-300 p-2">Produto</th>
                    <th className="border-b border-slate-300 p-2 text-right">Estoque inicial</th>
                    <th className="border-b border-slate-300 p-2 text-right">Saída</th>
                    <th className="border-b border-slate-300 p-2 text-right">Estoque final/atual</th>
                    <th className="border-b border-slate-300 p-2 text-right">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {group.products.map((p) => (
                    <tr key={p.productId} className="border-b border-slate-200">
                      <td className="p-2">
                        {p.name}
                        {p.sku ? <span className="ml-1 text-xs text-slate-400">({p.sku})</span> : null}
                      </td>
                      <td className="p-2 text-right tabular-nums">{p.opening}</td>
                      <td className="p-2 text-right tabular-nums text-rose-600">{p.out}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">{p.closing}</td>
                      <td className="p-2 text-right tabular-nums">{formatCurrency(p.soldRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold">
                    <td className="p-2 text-right" colSpan={4}>
                      Subtotal
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatCurrency(group.subtotal.soldRevenue)}
                    </td>
                  </tr>
                </tfoot>
              </SheetTable>
            </Section>
          ))
        )}

        <div className="flex items-center justify-between rounded-lg border-2 border-slate-800 bg-slate-50 px-4 py-3 print-avoid-break">
          <span className="text-base font-bold uppercase tracking-wide text-slate-800">
            Total do dia
          </span>
          <span className="text-xl font-extrabold tabular-nums text-slate-900">
            {formatCurrency(data.revenue)}
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Rotas">
            <SheetTable>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="p-2">Rotas concluídas</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{deliveries.completed}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-2">Entrega em andamento</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{deliveries.inProgress}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-2">Rotas canceladas</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{deliveries.cancelled}</td>
                </tr>
                <tr>
                  <td className="p-2">Rotas pendentes</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{deliveries.pending}</td>
                </tr>
              </tbody>
            </SheetTable>
          </Section>

          <Section title="Formas de pagamento">
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum pagamento no período.</p>
            ) : (
              <SheetTable>
                <tbody>
                  {payments.map((entry) => (
                    <tr key={entry.label} className="border-b border-slate-200 last:border-0">
                      <td className="p-2">{entry.label}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">
                        {formatCurrency(entry.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </SheetTable>
            )}
          </Section>
        </div>

        <Section title="Portaria">
          <div className="mb-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-md bg-sky-50 px-3 py-1.5 font-medium text-sky-800">
              {portaria?.salesCount ?? 0} vendas
            </span>
            <span className="rounded-md bg-sky-50 px-3 py-1.5 font-medium text-sky-800">
              {formatCurrency(portaria?.totalRevenue ?? 0)} em portaria
            </span>
          </div>

          {!portaria || portaria.byProduct.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma venda de portaria no período.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Por produto
                </h4>
                <SheetTable>
                  <thead className="bg-slate-100 text-left">
                    <tr>
                      <th className="border-b border-slate-300 p-2">Produto</th>
                      <th className="border-b border-slate-300 p-2 text-right">Qtd</th>
                      <th className="border-b border-slate-300 p-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portaria.byProduct.map((p) => (
                      <tr key={`${p.sku}-${p.name}`} className="border-b border-slate-200 last:border-0">
                        <td className="p-2">
                          {p.name}
                          {p.sku ? <span className="ml-1 text-xs text-slate-400">({p.sku})</span> : null}
                        </td>
                        <td className="p-2 text-right tabular-nums">{p.qty}</td>
                        <td className="p-2 text-right tabular-nums">{formatCurrency(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </SheetTable>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Por forma de pagamento
                </h4>
                {portaria.byPaymentMethod.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem pagamentos registrados.</p>
                ) : (
                  <SheetTable>
                    <tbody>
                      {portaria.byPaymentMethod.map((entry) => (
                        <tr key={entry.label} className="border-b border-slate-200 last:border-0">
                          <td className="p-2">{entry.label}</td>
                          <td className="p-2 text-right font-semibold tabular-nums">
                            {formatCurrency(entry.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </SheetTable>
                )}
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
