/**
 * Tipos do resultado por unidade (read-only, agregação).
 *
 * É a análise vertical do resultado: além dos valores em reais, cada linha traz sua
 * participação sobre o **faturamento** da unidade — margem quando é lucro, peso quando
 * é custo. O período segue o mesmo contrato do dashboard: `date` (dia único) ou
 * `dateFrom`/`dateTo` (intervalo inclusivo), no fuso `America/Sao_Paulo`.
 *
 * A cadeia é a mesma do painel master, com os mesmos helpers, para os números baterem:
 * `faturamento − CMV = lucro bruto`, e
 * `lucro bruto − taxas de pagamento − custos diretos = lucro líquido`.
 */

export interface StoreResultCategory {
  categoryId: string;
  name: string;
  icon: string | null;
  color: string | null;
  total: number;
  /** Participação sobre o faturamento da unidade. Null sem faturamento no período. */
  percent: number | null;
}

export interface StoreResult {
  /** Vazio na linha consolidada. */
  storeId: string;
  storeName: string;
  storeCode: string;
  salesCount: number;
  revenue: number;
  cogs: number;
  cogsPercent: number | null;
  grossProfit: number;
  grossMarginPercent: number | null;
  processingFees: number;
  processingFeesPercent: number | null;
  /** Despesas da unidade no período, por competência (`expenseDate`). */
  expensesTotal: number;
  expensesPercent: number | null;
  expensesByCategory: StoreResultCategory[];
  netProfit: number;
  netMarginPercent: number | null;
}

/** Categoria de despesa presente em ao menos uma unidade do período. */
export type StoreResultCategoryRef = Pick<
  StoreResultCategory,
  'categoryId' | 'name' | 'icon' | 'color'
>;

export interface StoreResultsResponse {
  /** Rótulo do período já formatado (ex.: `01/08/2026 a 31/08/2026`). */
  date: string;
  dateFrom: string;
  dateTo: string;
  stores: StoreResult[];
  /** Soma das unidades, com os percentuais recalculados sobre o faturamento total. */
  consolidated: StoreResult;
  /** União ordenada das categorias, para montar as linhas da tabela. */
  categories: StoreResultCategoryRef[];
}
