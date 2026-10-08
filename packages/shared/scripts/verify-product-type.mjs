import {
  glpCylinderSize,
  isAgua20LProduct,
  isGlpP13Product,
  isGlpP20Product,
  isGlpP45Product,
  isWaterFilledProduct,
} from '../dist/product-type.js';

function assert(label, condition) {
  if (!condition) {
    console.error('FAIL:', label);
    process.exitCode = 1;
  } else {
    console.log('OK:', label);
  }
}

assert(
  'GLP-P13 é P13',
  glpCylinderSize({ sku: 'GLP-P13', name: 'GLP 13KG', productType: 'GLP' }) === 'P13',
);
assert(
  'GLP-P20 é P20',
  glpCylinderSize({ sku: 'GLP-P20', name: 'GLP 20KG', productType: 'GLP' }) === 'P20',
);
assert(
  'GLP-P45 é P45',
  glpCylinderSize({ sku: 'GLP-P45', name: 'GLP 45KG', productType: 'GLP' }) === 'P45',
);
assert(
  'vasilhame 13KG não é botijão',
  glpCylinderSize({ sku: 'VAS-P13', name: 'Vasilhame 13KG', productType: 'VASILHAME' }) === null,
);
assert(
  'estoque P13 ignora produto GDP pelo nome',
  isGlpP13Product({ sku: 'GLP-P13', name: 'Gás do Povo 13KG', productType: 'GLP' }) === false,
);
assert(
  'venda P13 ainda conta GDP pelo SKU',
  glpCylinderSize({ sku: 'GLP-P13', name: 'Gás do Povo 13KG', productType: 'GLP' }) === 'P13',
);
assert('helpers P20/P45', isGlpP20Product({ sku: 'GLP-P20', productType: 'GLP' }));
assert('helpers P45', isGlpP45Product({ sku: 'GLP-P45', name: 'GLP 45 KG', productType: 'GLP' }));
assert(
  'P13 helper no SKU comum',
  isGlpP13Product({ sku: 'GLP-P13', name: 'GLP 13KG', productType: 'GLP' }),
);
assert(
  'Água Cristal 20L é garrafão cheio',
  isAgua20LProduct({ sku: 'AGUA', name: 'AGUA CRISTAL 20L', productType: 'AGUA' }),
);
assert(
  'vasilhame água 20L não conta como venda',
  isAgua20LProduct({ sku: 'VAS-AGUA', name: 'Vasilhame AGUA 20L', productType: 'VASILHAME' }) ===
    false,
);
assert(
  'galão cadastrado como tipo água não conta',
  isWaterFilledProduct({ sku: 'Galão', name: 'Vasilhame agua 20L', productType: 'Agua ' }) ===
    false,
);

console.log('product-type OK');
