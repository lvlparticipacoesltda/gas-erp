import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  PAYMENT_METHOD_LABELS,
  formatPaymentSumHint,
  paymentsLinesMatchTotal,
} from '@gas-erp/shared';
import { Button } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export interface StorePaymentMethodOption {
  id: string;
  label: string;
  systemCode: string | null;
  enabled?: boolean;
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
  gdpLocked?: boolean;
  /** Exibe GDP como opção selecionável nas formas de pagamento. */
  showGdpOption?: boolean;
  /** Disparado quando o entregador escolhe GDP em uma linha de pagamento. */
  onGdpSelected?: () => void;
  onAmountFocus?: () => void;
  /** Layout mais espaçado para telas cheias (ex.: concluir entrega). */
  comfortable?: boolean;
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

export function createGdpPaymentLines(
  gdpMethodId: string | undefined,
  methods: StorePaymentMethodOption[],
  saleTotal: number,
): PaymentLine[] {
  const gdpMethod =
    (gdpMethodId ? methods.find((m) => m.id === gdpMethodId) : undefined)
    ?? methods.find((m) => m.systemCode === 'GDP');
  if (!gdpMethod) return [];
  return [{ key: newPaymentLineKey(), storePaymentMethodId: gdpMethod.id, amount: saleTotal }];
}

export function paymentsMatchTotal(lines: PaymentLine[], saleTotal: number): boolean {
  return paymentsLinesMatchTotal(lines, saleTotal);
}

export function paymentLinesToPayload(lines: PaymentLine[]) {
  return lines.map((line) => ({
    storePaymentMethodId: line.storePaymentMethodId,
    amount: line.amount,
  }));
}

export function resolveEditorMethods(
  methods: StorePaymentMethodOption[],
  gdpLocked: boolean,
  showGdpOption = false,
): StorePaymentMethodOption[] {
  if (gdpLocked) {
    return methods.filter((m) => m.systemCode === 'GDP');
  }
  const regular = methods.filter((m) => m.systemCode !== 'GDP');
  if (!showGdpOption) return regular;
  const gdp = methods.find((m) => m.systemCode === 'GDP');
  return gdp ? [...regular, gdp] : regular;
}

export function SalePaymentsEditor({
  methods,
  lines,
  onChange,
  saleTotal,
  disabled = false,
  loadingMethods = false,
  methodsError,
  gdpLocked = false,
  showGdpOption = false,
  onGdpSelected,
  onAmountFocus,
  comfortable = false,
}: SalePaymentsEditorProps) {
  const availableMethods = useMemo(
    () => resolveEditorMethods(methods, gdpLocked, showGdpOption),
    [methods, gdpLocked, showGdpOption],
  );

  const paidTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (line.amount || 0), 0),
    [lines],
  );
  const sumHint = !gdpLocked
    ? formatPaymentSumHint(paidTotal, saleTotal, formatBrl)
    : null;

  function updateLine(key: string, patch: Partial<PaymentLine>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const method = availableMethods[0];
    if (!method) return;
    const remaining = saleTotal - paidTotal;
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

  if (gdpLocked) {
    const gdpLabel =
      availableMethods[0]?.label
      ?? PAYMENT_METHOD_LABELS.GDP;
    return (
      <View style={styles.gdpBanner}>
        <Text style={styles.gdpTitle}>Benefício Gás do Povo</Text>
        <Text style={styles.gdpText}>
          Esta venda foi registrada com benefício Gás do Povo. O pagamento deve ser 100%{' '}
          <Text style={styles.gdpStrong}>{gdpLabel}</Text> — {formatBrl(saleTotal)}.
        </Text>
      </View>
    );
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
      {lines.map((line, index) => (
        <View key={line.key} style={[styles.line, comfortable && styles.lineComfortable]}>
          {comfortable ? (
            <Text style={styles.lineLabel}>Pagamento {index + 1}</Text>
          ) : null}
          <View style={styles.methodRow}>
            {availableMethods.map((method) => {
              const selected = method.id === line.storePaymentMethodId;
              return (
                <Pressable
                  key={method.id}
                  disabled={disabled}
                  style={[
                    styles.methodChip,
                    comfortable && styles.methodChipComfortable,
                    selected && styles.methodChipSelected,
                  ]}
                  onPress={() => {
                    if (method.systemCode === 'GDP') onGdpSelected?.();
                    updateLine(line.key, { storePaymentMethodId: method.id });
                  }}
                >
                  <Text
                    style={[
                      styles.methodChipText,
                      comfortable && styles.methodChipTextComfortable,
                      selected && styles.methodChipTextSelected,
                    ]}
                  >
                    {method.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.amountLabel, comfortable && styles.amountLabelComfortable]}>
            Valor
          </Text>
          <TextInput
            style={[styles.amountInput, comfortable && styles.amountInputComfortable]}
            keyboardType="decimal-pad"
            editable={!disabled}
            value={line.amount > 0 ? String(line.amount) : ''}
            onFocus={onAmountFocus}
            onChangeText={(text) => {
              const normalized = text.replace(',', '.');
              const amount = normalized === '' ? 0 : Number(normalized);
              updateLine(line.key, { amount: Number.isFinite(amount) ? amount : 0 });
            }}
            placeholder="0,00"
            placeholderTextColor={colors.textFaint}
          />
          {!disabled && lines.length > 1 ? (
            <Pressable onPress={() => removeLine(line.key)}>
              <Text style={styles.remove}>Remover forma</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {!disabled && lines.length < availableMethods.length ? (
        <Button
          label="+ Adicionar forma de pagamento"
          variant="secondary"
          onPress={addLine}
        />
      ) : null}

      <View style={[styles.summary, comfortable && styles.summaryComfortable]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.totalHint, comfortable && styles.totalHintComfortable]}>
            Total da venda
          </Text>
          <Text style={[styles.totalValue, comfortable && styles.totalValueComfortable]}>
            {formatBrl(saleTotal)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.totalHint, comfortable && styles.totalHintComfortable]}>
            Informado
          </Text>
          <Text
            style={[
              styles.totalValue,
              comfortable && styles.totalValueComfortable,
              sumHint ? styles.totalValueError : null,
            ]}
          >
            {formatBrl(paidTotal)}
          </Text>
        </View>
        {sumHint ? <Text style={styles.sumHintError}>{sumHint}</Text> : null}
      </View>
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
  gdpBanner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#FFF4ED',
    gap: spacing.xs,
  },
  gdpTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  gdpText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  gdpStrong: { fontWeight: '700', color: colors.text },
  line: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  lineComfortable: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.lg,
  },
  lineLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
  methodChipComfortable: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  methodChipSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FFF4ED',
  },
  methodChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  methodChipTextComfortable: { fontSize: 14 },
  methodChipTextSelected: { color: colors.primary },
  amountLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  amountLabelComfortable: { fontSize: 14, fontWeight: '700' },
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
  amountInputComfortable: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '700',
  },
  remove: { fontSize: 13, color: colors.dangerText, fontWeight: '600' },
  summary: { gap: 4, marginTop: spacing.xs },
  summaryComfortable: {
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalHint: { fontSize: 13, color: colors.textMuted },
  totalHintComfortable: { fontSize: 15 },
  totalValue: { fontWeight: '700', color: colors.text },
  totalValueComfortable: { fontSize: 18 },
  totalValueError: { color: colors.warningText },
  sumHintError: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.warningText,
    lineHeight: 18,
  },
});
