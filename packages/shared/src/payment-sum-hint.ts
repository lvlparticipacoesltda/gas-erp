export const PAYMENT_SUM_TOLERANCE = 0.009;

export type PaymentSumStatus = 'ok' | 'under' | 'over';

export function getPaymentSumStatus(
  paidTotal: number,
  saleTotal: number,
): { status: PaymentSumStatus; difference: number } {
  const diff = saleTotal - paidTotal;
  if (saleTotal <= 0 || Math.abs(diff) <= PAYMENT_SUM_TOLERANCE) {
    return { status: 'ok', difference: 0 };
  }
  if (diff > 0) {
    return { status: 'under', difference: diff };
  }
  return { status: 'over', difference: Math.abs(diff) };
}

export function paymentsTotalMatches(paidTotal: number, saleTotal: number): boolean {
  return getPaymentSumStatus(paidTotal, saleTotal).status === 'ok';
}

/** Mensagem curta para exibir abaixo dos campos de pagamento. */
export function formatPaymentSumHint(
  paidTotal: number,
  saleTotal: number,
  formatCurrency: (value: number) => string,
): string | null {
  const { status, difference } = getPaymentSumStatus(paidTotal, saleTotal);
  if (status === 'ok') return null;

  const totalLabel = formatCurrency(saleTotal);

  if (status === 'over') {
    return `Só é aceito o valor exato da venda (${totalLabel}). Você passou ${formatCurrency(difference)}.`;
  }

  return `Só é aceito o valor exato da venda (${totalLabel}). Faltam ${formatCurrency(difference)}.`;
}

/** Mensagem para toast/alert ao tentar salvar com soma incorreta. */
export function getPaymentSumErrorMessage(paidTotal: number, saleTotal: number): string {
  const { status, difference } = getPaymentSumStatus(paidTotal, saleTotal);
  if (status === 'ok') return '';

  const total = saleTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const paid = paidTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const gap = difference.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (status === 'over') {
    return `Só é aceito o valor exato da venda (${total}). Você informou ${paid} — reduza ${gap}.`;
  }

  return `Só é aceito o valor exato da venda (${total}). Você informou ${paid} — faltam ${gap}.`;
}

export function sumPaymentLineAmounts(lines: { amount: number }[]): number {
  return lines.reduce((sum, line) => sum + (line.amount || 0), 0);
}

export function paymentsLinesMatchTotal(lines: { amount: number }[], saleTotal: number): boolean {
  return paymentsTotalMatches(sumPaymentLineAmounts(lines), saleTotal);
}

export function getPaymentLinesSumErrorMessage(lines: { amount: number }[], saleTotal: number): string {
  return getPaymentSumErrorMessage(sumPaymentLineAmounts(lines), saleTotal);
}
