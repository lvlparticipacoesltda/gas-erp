import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export interface StorePaymentMethodOption {
  id: string;
  label: string;
  systemCode: string | null;
}

export interface PaymentLine {
  key: string;
  storePaymentMethodId: string;
  amount: number;
}

interface SalePaymentsEditorProps {
  methods: StorePaymentMethodOption[];
  lines: PaymentLine[];
  onChange: (lines: PaymentLine[]) => void;
  saleTotal: number;
  disabled?: boolean;
  loadingMethods?: boolean;
  methodsError?: string;
}

export function newPaymentLineKey() {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createDefaultPaymentLines(
  methods: StorePaymentMethodOption[],
  saleTotal: number,
): PaymentLine[] {
  const method =
    methods.find((m) => m.systemCode === 'CASH')
    ?? methods[0];
  if (!method) return [];
  return [{ key: newPaymentLineKey(), storePaymentMethodId: method.id, amount: saleTotal }];
}

export function paymentsMatchTotal(lines: PaymentLine[], saleTotal: number): boolean {
  const paid = lines.reduce((sum, line) => sum + (line.amount || 0), 0);
  return Math.abs(paid - saleTotal) <= 0.009;
}

export function paymentLinesToPayload(lines: PaymentLine[]) {
  return lines.map((line) => ({
    storePaymentMethodId: line.storePaymentMethodId,
    amount: line.amount,
  }));
}

export function SalePaymentsEditor({
  methods,
  lines,
  onChange,
  saleTotal,
  disabled = false,
  loadingMethods = false,
  methodsError,
}: SalePaymentsEditorProps) {
  const availableMethods = useMemo(
    () => methods.filter((m) => m.systemCode !== 'GDP'),
    [methods],
  );

  const paidTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (line.amount || 0), 0),
    [lines],
  );
  const remaining = saleTotal - paidTotal;
  const mismatch = saleTotal > 0 && Math.abs(remaining) > 0.009;

  function updateLine(key: string, patch: Partial<PaymentLine>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const method = availableMethods[0];
    if (!method) return;
    onChange([
      ...lines,
      {
        key: newPaymentLineKey(),
        storePaymentMethodId: method.id,
        amount: Math.max(0, Number(remaining.toFixed(2))),
      },
    ]);
  }

  function removeLine(key: string) {
    if (lines.length <= 1) return;
    onChange(lines.filter((line) => line.key !== key));
  }

  if (loadingMethods) {
    return <Text style={styles.hint}>Carregando formas de pagamento...</Text>;
  }

  if (methodsError) {
    return <Text style={styles.error}>{methodsError}</Text>;
  }

  if (availableMethods.length === 0) {
    return (
      <Text style={styles.warning}>
        Nenhuma forma de pagamento ativa nesta loja. Peça à loja configurar em Formas de pagamento.
      </Text>
    );
  }

  return (
    <View style={styles.root}>
      {lines.map((line) => (
        <View key={line.key} style={styles.line}>
          <View style={styles.methodRow}>
            {availableMethods.map((method) => {
              const selected = method.id === line.storePaymentMethodId;
              return (
                <Pressable
                  key={method.id}
                  disabled={disabled}
                  style={[styles.methodChip, selected && styles.methodChipSelected]}
                  onPress={() => updateLine(line.key, { storePaymentMethodId: method.id })}
                >
                  <Text style={[styles.methodChipText, selected && styles.methodChipTextSelected]}>
                    {method.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.amountInput}
            keyboardType="decimal-pad"
            editable={!disabled}
            value={line.amount > 0 ? String(line.amount) : ''}
            onChangeText={(text) => {
              const normalized = text.replace(',', '.');
              const amount = normalized === '' ? 0 : Number(normalized);
              updateLine(line.key, { amount: Number.isFinite(amount) ? amount : 0 });
            }}
            placeholder="Valor"
            placeholderTextColor={colors.textFaint}
          />
          {!disabled && lines.length > 1 ? (
            <Pressable onPress={() => removeLine(line.key)}>
              <Text style={styles.remove}>Remover</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {!disabled && lines.length < availableMethods.length ? (
        <Button label="+ Adicionar forma" variant="secondary" onPress={addLine} />
      ) : null}

      <Text style={[styles.totalHint, mismatch && styles.totalHintError]}>
        Informado: {formatBrl(paidTotal)}
        {mismatch ? ` · faltam ${formatBrl(Math.abs(remaining))}` : ''}
      </Text>
    </View>
  );
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  hint: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.dangerText },
  warning: { fontSize: 13, color: colors.warningText },
  line: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  methodChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  methodChipSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FFF4ED',
  },
  methodChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  methodChipTextSelected: { color: colors.primary },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  remove: { fontSize: 13, color: colors.dangerText, fontWeight: '600' },
  totalHint: { fontSize: 13, color: colors.textMuted },
  totalHintError: { color: colors.warningText, fontWeight: '600' },
});
