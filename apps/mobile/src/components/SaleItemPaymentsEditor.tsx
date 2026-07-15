import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  aggregatePaymentsByMethodId,
  buildPaymentAllocationsFromItems,
} from '@gas-erp/shared';
import { colors, radius, spacing } from '@/theme';
import type { StorePaymentMethodOption } from '@/components/SalePaymentsEditor';

export interface SaleItemPaymentRow {
  key: string;
  label: string;
  quantity: number;
  unitPrice: number;
  storePaymentMethodId: string;
}

interface SaleItemPaymentsEditorProps {
  items: SaleItemPaymentRow[];
  onChangeItemMethod: (key: string, storePaymentMethodId: string) => void;
  deliveryFee: number;
  deliveryFeeStorePaymentMethodId: string;
  onChangeDeliveryFeeMethod: (storePaymentMethodId: string) => void;
  methods: StorePaymentMethodOption[];
}

export function paymentMethodsForSale(
  methods: StorePaymentMethodOption[],
): StorePaymentMethodOption[] {
  return methods.filter((m) => m.enabled !== false || m.systemCode === 'GDP');
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function SaleItemPaymentsEditor({
  items,
  onChangeItemMethod,
  deliveryFee,
  deliveryFeeStorePaymentMethodId,
  onChangeDeliveryFeeMethod,
  methods,
}: SaleItemPaymentsEditorProps) {
  const available = paymentMethodsForSale(methods);
  const summary = aggregatePaymentsByMethodId(
    buildPaymentAllocationsFromItems(
      items.map((item) => ({
        storePaymentMethodId: item.storePaymentMethodId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      deliveryFee,
      deliveryFeeStorePaymentMethodId || null,
    ),
  );

  if (available.length === 0) {
    return (
      <Text style={styles.warning}>
        Nenhuma forma de pagamento disponível. Peça à loja configurar em Formas de pagamento.
      </Text>
    );
  }

  return (
    <View style={styles.root}>
      {items.map((item) => (
        <View key={item.key} style={styles.card}>
          <Text style={styles.itemTitle}>
            {item.quantity}x {item.label}
          </Text>
          <Text style={styles.itemAmount}>{formatBrl(item.quantity * item.unitPrice)}</Text>
          <Text style={styles.label}>Forma de pagamento</Text>
          <View style={styles.chips}>
            {available.map((method) => {
              const active = item.storePaymentMethodId === method.id;
              return (
                <Pressable
                  key={method.id}
                  onPress={() => onChangeItemMethod(item.key, method.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {method.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {deliveryFee > 0.009 ? (
        <View style={[styles.card, styles.feeCard]}>
          <Text style={styles.itemTitle}>Taxa de entrega</Text>
          <Text style={styles.itemAmount}>{formatBrl(deliveryFee)}</Text>
          <Text style={styles.label}>Forma de pagamento</Text>
          <View style={styles.chips}>
            {available.map((method) => {
              const active = deliveryFeeStorePaymentMethodId === method.id;
              return (
                <Pressable
                  key={method.id}
                  onPress={() => onChangeDeliveryFeeMethod(method.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {method.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Resumo por forma</Text>
        {summary.map((row) => {
          const method = available.find((m) => m.id === row.storePaymentMethodId);
          return (
            <Text key={row.storePaymentMethodId} style={styles.summaryLine}>
              {method?.label ?? '—'} — {formatBrl(row.amount)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  feeCard: {
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceAlt,
  },
  itemTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemAmount: { fontSize: 13, color: colors.textMuted, marginTop: -4 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.infoBg,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.primary },
  summary: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    gap: 4,
  },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 },
  summaryLine: { fontSize: 13, color: colors.textMuted },
  warning: { fontSize: 13, color: colors.warningText },
});
