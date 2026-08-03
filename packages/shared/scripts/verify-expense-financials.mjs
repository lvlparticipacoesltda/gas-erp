import {
  allocateSharedExpenses,
  computeNetCost,
  computeNetProfitFromNetCost,
  sumExpenseAmounts,
} from '../dist/expense-financials.js';

function assert(label, condition) {
  if (!condition) {
    console.error('FAIL:', label);
    process.exitCode = 1;
  } else {
    console.log('OK:', label);
  }
}

const sum = (map) => [...map.values()].reduce((total, value) => total + value, 0);

// Rateio proporcional ao faturamento.
const proportional = allocateSharedExpenses(1000, [
  ['a', 6000],
  ['b', 4000],
]);
assert('rateio 60/40 → a', proportional.get('a') === 600);
assert('rateio 60/40 → b', proportional.get('b') === 400);
assert('rateio 60/40 fecha o total', sum(proportional) === 1000);

// Sem faturamento no período → rateio igualitário (o custo fixo não pode sumir).
const equal = allocateSharedExpenses(900, [
  ['a', 0],
  ['b', 0],
  ['c', 0],
]);
assert('sem faturamento → igualitário', equal.get('a') === 300 && equal.get('c') === 300);
assert('sem faturamento fecha o total', sum(equal) === 900);

// Divisão inexata: os centavos que sobram vão para os maiores restos e o total fecha.
const remainder = allocateSharedExpenses(100, [
  ['a', 1],
  ['b', 1],
  ['c', 1],
]);
assert('centavos distribuídos fecham 100', Math.abs(sum(remainder) - 100) < 1e-9);
assert(
  'nenhuma parte foge de 33,33/33,34',
  [...remainder.values()].every((value) => value === 33.33 || value === 33.34),
);

// Loja sem venda ainda recebe rateio quando as outras venderam.
const zeroStore = allocateSharedExpenses(500, [
  ['a', 1000],
  ['b', 0],
]);
assert('loja sem venda não recebe rateio proporcional', zeroStore.get('b') === 0);
assert('loja com venda absorve tudo', zeroStore.get('a') === 500);

// Casos de borda.
assert('sem lojas → mapa vazio', allocateSharedExpenses(100, []).size === 0);
const zeroTotal = allocateSharedExpenses(0, [['a', 100]]);
assert('total zero → zera todas', zeroTotal.get('a') === 0);

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

console.log('expense-financials OK');
