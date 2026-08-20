import { toNumber } from './business-day';

/** Detecta produtos do benefício Gás do Povo pelo nome (ex.: TAXA ENTREGA GÁS DO POVO). */
export function isGasDoPovoProductName(name?: string | null): boolean {
  if (!name) return false;
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalized.includes('gas do povo');
}

function isGlpProductType(productType?: string | null): boolean {
  return (productType ?? '').toUpperCase() === 'GLP';
}

export type SaleGdpItemInput = {
  quantity: number;
  total: unknown;
  productType?: string | null;
  storePaymentMethodId?: string | null;
};

export type SaleGdpPaymentInput = {
  amount: unknown;
  method: string;
  storePaymentMethodId?: string | null;
};

/**
 * Quantidade e valor Gás do Povo de uma venda.
 *
 * Quantidade e valor usam a mesma regra:
 * - pagamento por produto com GLP marcado GDP → só esses itens GLP;
 * - senão, se a venda é GDP (benefício, taxa Gás do Povo ou qualquer linha GDP)
 *   → todos os itens GLP.
 *
 * Não usa o valor das linhas de pagamento GDP: na venda por produto a taxa
 * costuma ir como GDP (R$ 10) e o botijão como PIX/dinheiro/cartão (R$ 107).
 * Contar a linha GDP subestimava o valor mesmo com o botijão já na quantidade.
 */
export function computeSaleGdpStats(
  sale: {
    gasDoPovoBenefit: boolean;
    items: SaleGdpItemInput[];
    payments: SaleGdpPaymentInput[];
  },
  gdpMethodIds: ReadonlySet<string>,
): { isGdp: boolean; quantity: number; revenue: number } {
  const isGdpPayment = (payment: SaleGdpPaymentInput) =>
    payment.method === 'GDP' ||
    (payment.storePaymentMethodId != null && gdpMethodIds.has(payment.storePaymentMethodId));

  const gdpPaymentRevenue = sale.payments.reduce(
    (sum, payment) => (isGdpPayment(payment) ? sum + toNumber(payment.amount) : sum),
    0,
  );

  let itemGdpQty = 0;
  let itemGdpRevenue = 0;
  let saleGlpQty = 0;
  let glpItemsRevenue = 0;

  for (const item of sale.items) {
    if (!isGlpProductType(item.productType)) continue;
    const qty = item.quantity;
    const total = toNumber(item.total);
    saleGlpQty += qty;
    glpItemsRevenue += total;
    const isGdpItem =
      item.storePaymentMethodId != null && gdpMethodIds.has(item.storePaymentMethodId);
    if (isGdpItem) {
      itemGdpQty += qty;
      itemGdpRevenue += total;
    }
  }

  const isGdp = sale.gasDoPovoBenefit || gdpPaymentRevenue > 0 || itemGdpQty > 0;
  if (itemGdpQty > 0) {
    return { isGdp: true, quantity: itemGdpQty, revenue: itemGdpRevenue };
  }
  if (isGdp) {
    return { isGdp: true, quantity: saleGlpQty, revenue: glpItemsRevenue };
  }
  return { isGdp: false, quantity: 0, revenue: 0 };
}
