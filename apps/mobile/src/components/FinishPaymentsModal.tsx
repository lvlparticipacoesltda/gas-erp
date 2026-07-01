import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

interface PaymentMethod {
  id: string;
  label: string;
  systemCode: string | null;
}

export interface PaymentLine {
  key: string;
  storePaymentMethodId: string;
  amount: number;
}

interface FinishPaymentsModalProps {
  visible: boolean;
  saleId: string;
  storeId: string;
  saleTotal: number;
  initialPayments?: { method: string; amount: number | string; storePaymentMethodId?: string | null }[];
  onClose: () => void;
  onConfirm: (payments: { storePaymentMethodId: string; amount: number }[]) => Promise<void>;
}

function lineKey() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseAmount(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function FinishPaymentsModal({
  visible,
  saleId,
  storeId,
  saleTotal,
  initialPayments,
  onClose,
  onConfirm,
}: FinishPaymentsModalProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    api<PaymentMethod[]>(`/stores/${storeId}/payment-methods?activeOnly=true`)
      .then((rows) => {
        const regular = rows.filter((m) => m.systemCode !== 'GDP');
        setMethods(regular);
        if (initialPayments?.length) {
          setLines(
            initialPayments.map((p, index) => ({
              key: `init-${index}`,
              storePaymentMethodId:
                p.storePaymentMethodId
                ?? regular.find((m) => m.systemCode === p.method)?.id
                ?? regular[0]?.id
                ?? '',
              amount: parseAmount(p.amount),
            })),
          );
        } else if (regular[0]) {
          setLines([{ key: lineKey(), storePaymentMethodId: regular[0].id, amount: saleTotal }]);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar formas de pagamento');
      });
  }, [visible, storeId, saleId, saleTotal, initialPayments]);

  const paidTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (line.amount || 0), 0),
    [lines],
  );
  const remaining = saleTotal - paidTotal;
  const mismatch = Math.abs(remaining) > 0.009;

  function updateLine(key: string, patch: Partial<PaymentLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const method = methods[0];
    if (!method) return;
    setLines((current) => [
      ...current,
      { key: lineKey(), storePaymentMethodId: method.id, amount: Math.max(0, Number(remaining.toFixed(2))) },
    ]);
  }

  function removeLine(key: string) {
    if (lines.length <= 1) return;
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function handleConfirm() {
    if (mismatch) {
      setError('A soma dos pagamentos deve ser igual ao total da venda.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = lines.map((line) => ({
        storePaymentMethodId: line.storePaymentMethodId,
        amount: line.amount,
      }));
      await onConfirm(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar os pagamentos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Formas de pagamento</Text>
          <Text style={styles.subtitle}>
            Total da venda: R$ {saleTotal.toFixed(2).replace('.', ',')}
          </Text>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {lines.map((line) => (
              <View key={line.key} style={styles.line}>
                <View style={styles.methodRow}>
                  {methods.map((method) => {
                    const selected = method.id === line.storePaymentMethodId;
                    return (
                      <Pressable
                        key={method.id}
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
                  value={line.amount > 0 ? String(line.amount) : ''}
                  onChangeText={(text) => {
                    const normalized = text.replace(',', '.');
                    const amount = normalized === '' ? 0 : Number(normalized);
                    updateLine(line.key, { amount: Number.isFinite(amount) ? amount : 0 });
                  }}
                  placeholder="Valor"
                />
                {lines.length > 1 ? (
                  <Pressable onPress={() => removeLine(line.key)}>
                    <Text style={styles.remove}>Remover</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}

            {methods.length > lines.length ? (
              <Button label="+ Adicionar forma" variant="secondary" onPress={addLine} />
            ) : null}
          </ScrollView>

          <Text style={[styles.totalHint, mismatch && styles.totalHintError]}>
            Informado: R$ {paidTotal.toFixed(2).replace('.', ',')}
            {mismatch ? ` · faltam R$ ${Math.abs(remaining).toFixed(2).replace('.', ',')}` : ''}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button label="Cancelar" variant="secondary" onPress={onClose} style={styles.flex} />
            <Button
              label="Concluir entrega"
              variant="success"
              loading={loading}
              onPress={handleConfirm}
              style={styles.flex}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, fontSize: 14, color: colors.textMuted },
  scroll: { marginTop: spacing.md, maxHeight: 320 },
  line: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
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
  totalHint: { marginTop: spacing.sm, fontSize: 13, color: colors.textMuted },
  totalHintError: { color: colors.warningText, fontWeight: '600' },
  error: { marginTop: spacing.sm, fontSize: 13, color: colors.dangerText },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
});
