import {
  computeNetCost,
  computeNetProfitFromNetCost,
  sumExpenseAmounts,
} from '../dist/expense-financials.js';
import { computeMarginPercent } from '../dist/sale-financials.js';

function assert(label, condition) {
  if (!condition) {
    console.error('FAIL:', label);
    process.exitCode = 1;
  } else {
    console.log('OK:', label);
  }
}

// Custo líquido e lucro líquido.
assert('custo líquido soma as três parcelas', computeNetCost(1000, 50, 200) === 1250);
assert('lucro líquido = faturamento − custo líquido', computeNetProfitFromNetCost(2000, 1250) === 750);
assert(
  'sem despesas o custo líquido é CMV + taxas',
  computeNetCost(1000, 50, 0) === 1050,
);

// Soma de Decimal (string) sem ruído de ponto flutuante.
assert(
  'soma 0,1 + 0,2 = 0,3',
  sumExpenseAmounts([{ amount: '0.10' }, { amount: '0.20' }]) === 0.3,
);

// Margem é sobre o faturamento, não sobre o CMV (que daria markup).
assert('margem de 40 sobre 100 = 40%', computeMarginPercent(100, 40) === 40);
assert('participação de 60 sobre 100 = 60%', computeMarginPercent(100, 60) === 60);
assert('sem faturamento não há margem', computeMarginPercent(0, 40) === null);
assert('prejuízo vira margem negativa', computeMarginPercent(100, -25) === -25);
assert('percentual arredondado em 2 casas', computeMarginPercent(3, 1) === 33.33);

// A análise vertical fecha: faturamento − (CMV + taxas + despesas) = lucro líquido,
// e os percentuais das linhas somam 100%.
{
  const revenue = 10000;
  const cogs = 6000;
  const fees = 150;
  const expenses = 2200;
  const netCost = computeNetCost(cogs, fees, expenses);
  const netProfit = computeNetProfitFromNetCost(revenue, netCost);
  assert('lucro líquido do exemplo', netProfit === 1650);
  const percents = [cogs, fees, expenses, netProfit].map((value) =>
    computeMarginPercent(revenue, value),
  );
  assert(
    'linhas da análise vertical somam 100%',
    Math.abs(percents.reduce((sum, value) => sum + value, 0) - 100) < 1e-9,
  );
}

console.log('expense-financials OK');
