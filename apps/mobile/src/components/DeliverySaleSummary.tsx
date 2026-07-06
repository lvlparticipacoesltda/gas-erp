import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { PAYMENT_METHOD_LABELS } from '@gas-erp/shared';
import { colors, spacing } from '../theme';
import type { Sale, SaleItem } from '../types';

function formatCurrency(value: number | string | null | undefined): string {
  const n = value == null ? 0 : typeof value === 'number' ? value : Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatSaleItemLine(item: SaleItem, showUnitPrice?: boolean): string {
  const base = `${item.quantity}x ${item.product.name}`;
  if (!showUnitPrice || item.unitPrice == null) return base;
  const price = typeof item.unitPrice === 'number' ? item.unitPrice : Number(item.unitPrice);
  if (Number.isFinite(price) && price > 0) {
    return `${base} · ${formatCurrency(price)}`;
  }
  return base;
}

export function formatSaleItemsSummary(sale: Sale, options?: { showUnitPrice?: boolean }): string {
  const showUnitPrice = options?.showUnitPrice ?? Boolean(sale.gasDoPovoBenefit);
  if (!sale.items.length) return '—';
  return sale.items.map((i) => formatSaleItemLine(i, showUnitPrice)).join(', ');
}

export function formatSalePaymentsSummary(sale: Sale): string {
  if (sale.gasDoPovoBenefit) {
    return PAYMENT_METHOD_LABELS.GDP;
  }
  const payments = sale.payments ?? [];
  if (payments.length === 0) return '—';
  const labels = [...new Set(payments.map((p) => PAYMENT_METHOD_LABELS[p.method] ?? p.method))];
  return labels.join(', ');
}

export function DeliverySaleSummary({
  sale,
  compact,
  showTotal,
  style,
  itemsStyle,
  paymentStyle,
}: {
  sale: Sale;
  compact?: boolean;
  showTotal?: boolean;
  style?: StyleProp<ViewStyle>;
  itemsStyle?: StyleProp<TextStyle>;
  paymentStyle?: StyleProp<TextStyle>;
}) {
  const items = formatSaleItemsSummary(sale);
  const payments = formatSalePaymentsSummary(sale);

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.items, itemsStyle]} numberOfLines={compact ? 2 : undefined}>
        {items}
      </Text>
      <Text style={[styles.payment, paymentStyle]} numberOfLines={compact ? 1 : undefined}>
        Pagamento: {payments}
      </Text>
      {showTotal && sale.total != null ? (
        <Text style={styles.total}>{formatCurrency(sale.total)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  items: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  payment: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
  total: { fontSize: 14, fontWeight: '700', color: colors.text },
});
