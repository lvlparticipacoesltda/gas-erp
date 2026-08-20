import { computeSaleGdpStats } from '../dist/gas-do-povo.js';

function assert(label, condition) {
  if (!condition) {
    console.error('FAIL:', label);
    process.exitCode = 1;
  } else {
    console.log('OK:', label);
  }
}

const gdpId = 'gdp-method';
const gdpMethodIds = new Set([gdpId]);

// Produção 19/08/2026 — Sidney / Santos: taxa GDP R$ 10 + botijão no cartão/PIX/dinheiro.
const sidneyTaxaGdp = computeSaleGdpStats(
  {
    gasDoPovoBenefit: true,
    items: [
      { quantity: 1, total: 10, productType: 'TAXA', storePaymentMethodId: gdpId },
      { quantity: 1, total: 107.02, productType: 'GLP', storePaymentMethodId: 'debit' },
    ],
    payments: [
      { method: 'DEBIT_CARD', amount: 107.02, storePaymentMethodId: 'debit' },
      { method: 'GDP', amount: 10, storePaymentMethodId: gdpId },
    ],
  },
  gdpMethodIds,
);
assert('Sidney taxa-GDP conta 1 botijão', sidneyTaxaGdp.quantity === 1);
assert('Sidney taxa-GDP usa o valor do GLP, não os R$ 10', sidneyTaxaGdp.revenue === 107.02);
assert('Sidney taxa-GDP é venda GDP', sidneyTaxaGdp.isGdp === true);

const sidneyAllCash = computeSaleGdpStats(
  {
    gasDoPovoBenefit: true,
    items: [
      { quantity: 1, total: 10, productType: 'TAXA', storePaymentMethodId: 'cash' },
      { quantity: 1, total: 107.02, productType: 'GLP', storePaymentMethodId: 'cash' },
    ],
    payments: [{ method: 'CASH', amount: 117.02, storePaymentMethodId: 'cash' }],
  },
  gdpMethodIds,
);
assert('benefício sem linha GDP ainda soma o botijão', sidneyAllCash.quantity === 1);
assert('benefício sem linha GDP usa valor do GLP', sidneyAllCash.revenue === 107.02);

// Demais entregadores: botijão marcado GDP, taxa em PIX.
const maxwell = computeSaleGdpStats(
  {
    gasDoPovoBenefit: true,
    items: [
      { quantity: 1, total: 107.02, productType: 'GLP', storePaymentMethodId: gdpId },
      { quantity: 1, total: 10, productType: 'TAXA', storePaymentMethodId: 'pix' },
    ],
    payments: [
      { method: 'GDP', amount: 107.02, storePaymentMethodId: gdpId },
      { method: 'PIX', amount: 10, storePaymentMethodId: 'pix' },
    ],
  },
  gdpMethodIds,
);
assert('botijão GDP continua 1 x 107,02', maxwell.quantity === 1 && maxwell.revenue === 107.02);

const mixed = computeSaleGdpStats(
  {
    gasDoPovoBenefit: false,
    items: [
      { quantity: 1, total: 107.02, productType: 'GLP', storePaymentMethodId: gdpId },
      { quantity: 1, total: 130, productType: 'GLP', storePaymentMethodId: 'pix' },
    ],
    payments: [
      { method: 'GDP', amount: 107.02, storePaymentMethodId: gdpId },
      { method: 'PIX', amount: 130, storePaymentMethodId: 'pix' },
    ],
  },
  gdpMethodIds,
);
assert('venda mista só conta o GLP pago com GDP', mixed.quantity === 1 && mixed.revenue === 107.02);

const regular = computeSaleGdpStats(
  {
    gasDoPovoBenefit: false,
    items: [{ quantity: 2, total: 260, productType: 'GLP', storePaymentMethodId: 'pix' }],
    payments: [{ method: 'PIX', amount: 260, storePaymentMethodId: 'pix' }],
  },
  gdpMethodIds,
);
assert('venda comum não entra em GDP', regular.isGdp === false && regular.quantity === 0 && regular.revenue === 0);

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('gas-do-povo OK');
