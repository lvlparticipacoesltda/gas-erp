'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageLoader } from '@/components/brand-loader';
import { DailySummaryDateFilter } from '@/components/daily-summary-date-filter';
import { LoadingOverlay } from '@/components/loading-overlay';
import { CategoryIcon } from '@/components/expenses/category-icon';
import { Alert, Card, PageHeader, Table } from '@/components/ui';
import { useLiveQuery } from '@/hooks/use-live-query';
import { api, getToken } from '@/lib/api';
import { buildDashboardDateQuery } from '@/lib/dashboard-date';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';
import { todayDateKey, type StoreResult, type StoreResultsResponse } from '@gas-erp/shared';

/**
 * Sem moldura de foco no gráfico: o Recharts marca o `<svg>` com `tabIndex=0` e
 * `role="application"`, e o clique deixava a caixa de foco azul do Chrome em volta do
 * gráfico inteiro. Com `accessibilityLayer={false}` o svg deixa de ser focável — os
 * mesmos números seguem na tabela "Composição do resultado", essa sim navegável.
 */
const CHART_NO_FOCUS_BOX = 'select-none [&_.recharts-surface]:outline-none';

function profitTone(value: number): string {
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-rose-600';
  return 'text-slate-500';
}

/** Sem faturamento não há margem: o travessão fica neutro, senão vira uma barra
 *  vermelha do tamanho de um número e o cartão parece estar informando algo. */
function marginTone(percent: number | null, netProfit: number): string {
  return percent == null ? 'text-slate-300' : profitTone(netProfit);
}

/** Uma linha da análise vertical, já resolvida para cada unidade. */
type ResultLine = {
  key: string;
  label: string;
  /**
   * Peso visual da linha. O fundo cinza é reservado a resultado (`subtotal` e
   * `result`); `group` é o total de custos diretos, que abre as categorias.
   */
  variant: 'plain' | 'subtotal' | 'result' | 'category' | 'group';
  icon?: { icon: string | null; color: string | null };
  valueOf: (result: StoreResult) => number;
  percentOf: (result: StoreResult) => number | null;
};

function buildLines(data: StoreResultsResponse): ResultLine[] {
  const categoryLines: ResultLine[] = data.categories.map((category) => ({
    key: `category:${category.categoryId}`,
    label: category.name,
    variant: 'category',
    icon: { icon: category.icon, color: category.color },
    valueOf: (result) =>
      result.expensesByCategory.find((row) => row.categoryId === category.categoryId)?.total ?? 0,
    percentOf: (result) =>
      result.expensesByCategory.find((row) => row.categoryId === category.categoryId)?.percent ??
      null,
  }));

  return [
    {
      key: 'revenue',
      label: 'Faturamento',
      variant: 'subtotal',
      valueOf: (result) => result.revenue,
      // A base da análise é sempre 100% — exceto quando não houve faturamento.
      percentOf: (result) => (result.revenue > 0 ? 100 : null),
    },
    {
      key: 'cogs',
      label: '(−) CMV',
      variant: 'plain',
      valueOf: (result) => result.cogs,
      percentOf: (result) => result.cogsPercent,
    },
    {
      key: 'grossProfit',
      label: '= Lucro bruto',
      variant: 'subtotal',
      valueOf: (result) => result.grossProfit,
      percentOf: (result) => result.grossMarginPercent,
    },
    {
      key: 'fees',
      label: '(−) Taxas de pagamento',
      variant: 'plain',
      valueOf: (result) => result.processingFees,
      percentOf: (result) => result.processingFeesPercent,
    },
    {
      key: 'expenses',
      label: '(−) Custos diretos',
      variant: 'group',
      valueOf: (result) => result.expensesTotal,
      percentOf: (result) => result.expensesPercent,
    },
    ...categoryLines,
    {
      key: 'netProfit',
      label: '= Lucro líquido',
      variant: 'result',
      valueOf: (result) => result.netProfit,
      percentOf: (result) => result.netMarginPercent,
    },
  ];
}

/** Todo variant carrega fundo próprio: as colunas fixas usam `bg-inherit` e ficariam
 *  transparentes (deixando o miolo rolar por baixo) se a linha não tivesse cor. */
const LINE_CLASS: Record<ResultLine['variant'], string> = {
  plain: 'bg-white text-slate-600',
  subtotal: 'bg-slate-50 font-semibold text-slate-800',
  result: 'bg-slate-100 font-bold text-slate-900',
  category: 'bg-white text-slate-500',
  group: 'bg-white font-medium text-slate-700',
};

/**
 * Base das porcentagens da tela inteira — cartões, gráfico e tabela.
 *
 * `revenue` é a análise vertical (o valor sobre o faturamento da própria unidade);
 * `consolidated` é a participação da unidade no total da rede.
 */
type PercentMode = 'revenue' | 'consolidated';

const PERCENT_MODES: { value: PercentMode; label: string; title: string }[] = [
  {
    value: 'revenue',
    label: '% do faturamento',
    title: 'Análise vertical: cada valor sobre o faturamento da própria unidade',
  },
  {
    value: 'consolidated',
    label: '% do consolidado',
    title:
      'Participação: quanto cada unidade representa no total da rede naquela linha. Em linha de resultado, o sinal acompanha o próprio lucro ou prejuízo da unidade',
  },
];

function PercentModeToggle({
  value,
  onChange,
}: {
  value: PercentMode;
  onChange: (mode: PercentMode) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {PERCENT_MODES.map((mode) => {
        const selected = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            title={mode.title}
            aria-pressed={selected}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
              selected
                ? 'bg-brand text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
            )}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Participação de um valor no total da rede. Sem total não há participação.
 *
 * A base é o **módulo** do consolidado, não o valor com sinal. Linhas de custo são
 * sempre positivas e nada muda nelas; o que a divisão crua quebrava era o resultado:
 * com a rede no prejuízo, dividir por um total negativo inverte todo mundo — a
 * unidade que deu lucro apareceria com percentual negativo e as que deram prejuízo,
 * positivo. Com o módulo, o sinal do percentual é sempre o sinal do próprio dinheiro,
 * a linha continua somando ±100% e o −100% do consolidado já avisa que a base é
 * prejuízo.
 */
function shareOfTotal(value: number, total: number): number | null {
  if (total === 0) return null;
  return (value / Math.abs(total)) * 100;
}

/** Sombra de 1px que separa a coluna fixa do miolo rolável. */
const STICKY_LEFT = 'sticky left-0 bg-inherit shadow-[1px_0_0_0_#e2e8f0]';
const STICKY_RIGHT = 'sticky right-0 bg-inherit shadow-[-1px_0_0_0_#e2e8f0]';
const CELL_BORDER = 'border-t border-slate-100';

/** Primeiro dia do mês corrente, no fuso das lojas. */
function monthStartDateKey(): string {
  return `${todayDateKey().slice(0, 7)}-01`;
}

export function StoreResultsPanel() {
  const [dateFrom, setDateFrom] = useState(monthStartDateKey);
  const [dateTo, setDateTo] = useState(todayDateKey);
  // Custos diretos entram fechados: a leitura primária é o total, e a abertura por
  // categoria é o segundo passo de quem foi investigar de onde vem o custo.
  const [expensesOpen, setExpensesOpen] = useState(false);
  // O aceno da barra de acento só faz sentido até a primeira interação.
  const [hintDone, setHintDone] = useState(false);

  const [percentMode, setPercentMode] = useState<PercentMode>('revenue');

  const toggleExpenses = useCallback(() => {
    setExpensesOpen((open) => !open);
    setHintDone(true);
  }, []);
  const query = useMemo(() => buildDashboardDateQuery(dateFrom, dateTo), [dateFrom, dateTo]);

  const { data, loading, isRefetching, error } = useLiveQuery<StoreResultsResponse>(
    (signal) => api(`/results/by-store?${query}`, { signal }, getToken()),
    [query],
    { realtime: { type: 'org' } },
  );

  const lines = useMemo(() => (data ? buildLines(data) : []), [data]);
  const visibleLines = useMemo(
    () => lines.filter((line) => line.variant !== 'category' || expensesOpen),
    [lines, expensesOpen],
  );
  const categoryCount = data?.categories.length ?? 0;

  /**
   * `revenue` é a análise vertical (o valor sobre o faturamento da unidade);
   * `consolidated` é a participação da unidade no total da linha — a leitura que
   * responde "de onde vem esse custo" quando há muitas unidades.
   */
  const percentFor = useCallback(
    (line: ResultLine, result: StoreResult): number | null => {
      if (percentMode === 'revenue') return line.percentOf(result);
      return shareOfTotal(line.valueOf(result), data ? line.valueOf(data.consolidated) : 0);
    },
    [percentMode, data],
  );

  /** Número em destaque do cartão: margem da unidade ou fatia do lucro da rede. */
  const cardPercent = useCallback(
    (store: StoreResult): number | null =>
      percentMode === 'revenue'
        ? store.netMarginPercent
        : shareOfTotal(store.netProfit, data?.consolidated.netProfit ?? 0),
    [percentMode, data],
  );

  if (loading && !data) return <PageLoader label="Carregando resultado…" />;

  const stores = data?.stores ?? [];
  // Com a rede no vermelho a base da participação é um prejuízo, e chamar isso de
  // "participação no lucro" contradiz o número exibido logo abaixo.
  const consolidatedNetProfit = data?.consolidated.netProfit ?? 0;
  const networkAtLoss = consolidatedNetProfit < 0;
  const shareLabel = networkAtLoss ? 'Participação no prejuízo' : 'Participação no lucro';
  // A cor da barra segue o sinal do lucro em reais — a fonte da verdade. Com a
  // participação medida sobre o módulo do consolidado os dois sinais coincidem, mas
  // amarrar a cor ao dinheiro mantém a barra correta em qualquer base.
  const marginChartData = stores
    .map((store) => ({
      name: store.storeName,
      percent: cardPercent(store),
      netProfit: store.netProfit,
    }))
    .filter((row): row is { name: string; percent: number; netProfit: number } => row.percent != null);
  const chartTitle =
    percentMode === 'revenue' ? 'Margem líquida por unidade' : `${shareLabel} líquido da rede`;

  return (
    <>
      <PageHeader
        title="Resultado por unidade"
        subtitle={
          data?.date
            ? `Margem líquida e composição do resultado · ${data.date}`
            : 'Margem líquida e composição do resultado de cada unidade'
        }
        action={<PercentModeToggle value={percentMode} onChange={setPercentMode} />}
      />

      <DailySummaryDateFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
        }}
        disabled={isRefetching}
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      <LoadingOverlay loading={isRefetching}>
        {stores.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-slate-500">
              Nenhuma unidade ativa para apurar no período.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {stores.map((store) => (
                <Card key={store.storeId}>
                  <div className="truncate text-sm font-semibold text-slate-700">
                    {store.storeName}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {percentMode === 'revenue' ? 'Margem líquida' : shareLabel}
                  </div>
                  <div
                    className={`text-3xl font-extrabold ${marginTone(cardPercent(store), store.netProfit)}`}
                  >
                    {formatPercent(cardPercent(store))}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Lucro líquido{' '}
                    <span className={`font-semibold ${profitTone(store.netProfit)}`}>
                      {formatCurrency(store.netProfit)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {percentMode === 'revenue'
                      ? `sobre ${formatCurrency(store.revenue)} faturados`
                      : `de ${formatCurrency(Math.abs(consolidatedNetProfit))} ${
                          networkAtLoss ? 'de prejuízo' : 'de lucro'
                        } da rede`}
                  </div>
                </Card>
              ))}

              {data && (
                // O consolidado é a própria base da participação — mostrar "100%" aqui
                // não informaria nada, então este cartão segue na margem da rede.
                <Card className="border-brand/30 bg-brand/5">
                  <div className="text-sm font-semibold text-slate-700">Consolidado</div>
                  <div className="mt-2 text-xs text-slate-500">Margem líquida da rede</div>
                  <div
                    className={`text-3xl font-extrabold ${marginTone(
                      data.consolidated.netMarginPercent,
                      data.consolidated.netProfit,
                    )}`}
                  >
                    {formatPercent(data.consolidated.netMarginPercent)}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Lucro líquido{' '}
                    <span className={`font-semibold ${profitTone(data.consolidated.netProfit)}`}>
                      {formatCurrency(data.consolidated.netProfit)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    sobre {formatCurrency(data.consolidated.revenue)} faturados
                  </div>
                </Card>
              )}
            </div>

            {data && (
              <Card>
                <div className="mb-3 text-sm font-semibold text-slate-700">
                  Composição do resultado
                  <span className="ml-1 font-normal text-slate-400">
                    · valor e{' '}
                    {percentMode === 'revenue'
                      ? '% do faturamento da unidade'
                      : '% do consolidado da linha'}
                  </span>
                </div>
                <Table className="border-separate border-spacing-0">
                  <thead className="text-left">
                    <tr className="bg-slate-50">
                      <th className={cn('px-3 py-3', STICKY_LEFT, 'z-20')}>Linha</th>
                      {stores.map((store) => (
                        <th key={store.storeId} className="whitespace-nowrap px-3 py-3 text-right">
                          {store.storeName}
                        </th>
                      ))}
                      <th className={cn('px-3 py-3 text-right', STICKY_RIGHT, 'z-20')}>
                        Consolidado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLines.map((line) => {
                      const expandable = line.variant === 'group' && categoryCount > 0;
                      return (
                        <tr
                          key={line.key}
                          className={cn(
                            LINE_CLASS[line.variant],
                            expandable &&
                              'result-expandable cursor-pointer transition-colors hover:bg-brand-muted',
                            expandable && !hintDone && 'result-expandable-hint',
                          )}
                          data-open={expandable ? expensesOpen : undefined}
                          onClick={expandable ? toggleExpenses : undefined}
                        >
                          <td className={cn('whitespace-nowrap px-3 py-2', CELL_BORDER, STICKY_LEFT, 'z-10')}>
                            {line.variant === 'category' ? (
                              <span className="flex items-center gap-1.5 pl-6">
                                <CategoryIcon
                                  icon={line.icon?.icon}
                                  color={line.icon?.color}
                                  className="h-5 w-5 shrink-0"
                                />
                                {line.label}
                              </span>
                            ) : expandable ? (
                              // O clique fica no `<tr>` (alvo grande); o botão existe para
                              // teclado e leitor de tela — seu clique borbulha para a linha,
                              // por isso não repete o handler.
                              <button
                                type="button"
                                aria-expanded={expensesOpen}
                                className="rounded text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                              >
                                {line.label}
                              </button>
                            ) : (
                              line.label
                            )}
                          </td>
                          {stores.map((store) => (
                            <td
                              key={`${line.key}:${store.storeId}`}
                              className={cn(
                                'whitespace-nowrap px-3 py-2 text-right tabular-nums',
                                CELL_BORDER,
                              )}
                            >
                              {formatCurrency(line.valueOf(store))}
                              <span className="ml-2 text-xs font-normal text-slate-400">
                                {formatPercent(percentFor(line, store))}
                              </span>
                            </td>
                          ))}
                          <td
                            className={cn(
                              'whitespace-nowrap px-3 py-2 text-right tabular-nums',
                              CELL_BORDER,
                              STICKY_RIGHT,
                              'z-10',
                            )}
                          >
                            {formatCurrency(line.valueOf(data.consolidated))}
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              {formatPercent(percentFor(line, data.consolidated))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
            )}

            <Card>
              <div className="mb-1 text-sm font-semibold text-slate-700">{chartTitle}</div>
              {marginChartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {percentMode === 'revenue'
                    ? 'Sem faturamento no período para calcular margem.'
                    : 'Sem lucro consolidado no período para calcular participação.'}
                </p>
              ) : (
                <div className={`h-56 ${CHART_NO_FOCUS_BOX}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={marginChartData}
                      layout="vertical"
                      accessibilityLayer={false}
                      margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(value) => `${Math.round(Number(value))}%`}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        width={110}
                      />
                      <Tooltip
                        formatter={(value) => formatPercent(Number(value))}
                        labelFormatter={(label) => String(label)}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                      />
                      <Bar dataKey="percent" radius={[0, 4, 4, 0]} barSize={18}>
                        {marginChartData.map((row) => (
                          <Cell key={row.name} fill={row.netProfit >= 0 ? '#10b981' : '#e11d48'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>
        )}
      </LoadingOverlay>
    </>
  );
}
