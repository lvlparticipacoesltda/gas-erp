/** Totais e agregação de pagamento por produto. */

export function saleItemLineTotal(item: {
  quantity: number;
  unitPrice: number;
  discount?: number | null;
}): number {
  return item.quantity * item.unitPrice - (item.discount ?? 0);
}

export function aggregatePaymentsByMethodId(
  allocations: { storePaymentMethodId: string; amount: number }[],
): { storePaymentMethodId: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const row of allocations) {
    if (!row.storePaymentMethodId || row.amount <= 0) continue;
    map.set(row.storePaymentMethodId, (map.get(row.storePaymentMethodId) ?? 0) + row.amount);
  }
  return [...map.entries()].map(([storePaymentMethodId, amount]) => ({
    storePaymentMethodId,
    amount: Number(amount.toFixed(2)),
  }));
}

/**
 * Monta linhas de pagamento a partir dos produtos (+ taxa de entrega).
 * Retorna [] se nenhum item tiver forma definida.
 */
export function buildPaymentAllocationsFromItems(
  items: {
    storePaymentMethodId?: string | null;
    quantity: number;
    unitPrice: number;
    discount?: number | null;
  }[],
  deliveryFee = 0,
  deliveryFeeStorePaymentMethodId?: string | null,
): { storePaymentMethodId: string; amount: number }[] {
  const withMethod = items.filter((item) => Boolean(item.storePaymentMethodId));
  if (withMethod.length === 0) return [];

  const rows: { storePaymentMethodId: string; amount: number }[] = withMethod.map((item) => ({
    storePaymentMethodId: item.storePaymentMethodId!,
    amount: saleItemLineTotal(item),
  }));

  if (deliveryFee > 0.009) {
    const feeMethodId =
      deliveryFeeStorePaymentMethodId
      ?? withMethod[0]?.storePaymentMethodId
      ?? null;
    if (feeMethodId) {
      rows.push({ storePaymentMethodId: feeMethodId, amount: deliveryFee });
    }
  }

  return aggregatePaymentsByMethodId(rows);
}

export function allItemsHavePaymentMethod(
  items: { storePaymentMethodId?: string | null }[],
): boolean {
  return items.length > 0 && items.every((item) => Boolean(item.storePaymentMethodId));
}

export function anyItemHasPaymentMethod(
  items: { storePaymentMethodId?: string | null }[],
): boolean {
  return items.some((item) => Boolean(item.storePaymentMethodId));
}
