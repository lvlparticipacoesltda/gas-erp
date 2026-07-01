import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';
import {
  SalePaymentsEditor,
  createDefaultPaymentLines,
  paymentLinesToPayload,
  paymentsMatchTotal,
  type PaymentLine,
  type StorePaymentMethodOption,
} from '@/components/SalePaymentsEditor';

interface FinishPaymentsModalProps {
  visible: boolean;
  saleId: string;
  storeId: string;
  saleTotal: number;
  initialPayments?: { method: string; amount: number | string; storePaymentMethodId?: string | null }[];
  onClose: () => void;
  onConfirm: (payments: { storePaymentMethodId: string; amount: number }[]) => Promise<void>;
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
  const [methods, setMethods] = useState<StorePaymentMethodOption[]>([]);
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [loading, setLoading] = useState(false);
  const [methodsError, setMethodsError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setMethodsError('');
    setLoadingMethods(true);
    api<StorePaymentMethodOption[]>(`/stores/${storeId}/payment-methods?activeOnly=true`)
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
        } else {
          setLines(createDefaultPaymentLines(regular, saleTotal));
        }
      })
      .catch((err) => {
        setMethodsError(err instanceof Error ? err.message : 'Erro ao carregar formas de pagamento');
      })
      .finally(() => setLoadingMethods(false));
  }, [visible, storeId, saleId, saleTotal, initialPayments]);

  async function handleConfirm() {
    if (!paymentsMatchTotal(lines, saleTotal)) {
      setError('A soma dos pagamentos deve ser igual ao total da venda.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(paymentLinesToPayload(lines));
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
            Total da venda: {saleTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </Text>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <SalePaymentsEditor
              methods={methods}
              lines={lines}
              onChange={setLines}
              saleTotal={saleTotal}
              loadingMethods={loadingMethods}
              methodsError={methodsError}
            />
          </ScrollView>

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
  error: { marginTop: spacing.sm, fontSize: 13, color: colors.dangerText },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
});
