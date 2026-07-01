import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getPaymentLinesSumErrorMessage } from '@gas-erp/shared';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';
import {
  SalePaymentsEditor,
  createDefaultPaymentLines,
  createGdpPaymentLines,
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
  gasDoPovoBenefit?: boolean;
  itemQuantity?: number;
  initialUnitPrice?: number;
  initialPayments?: { method: string; amount: number | string; storePaymentMethodId?: string | null }[];
  onClose: () => void;
  onConfirm: (
    payments: { storePaymentMethodId: string; amount: number }[],
    unitPrice?: number,
  ) => Promise<void>;
}

function parseAmount(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildInitialLines(
  methods: StorePaymentMethodOption[],
  saleTotal: number,
  gasDoPovoBenefit: boolean,
  initialPayments?: FinishPaymentsModalProps['initialPayments'],
): PaymentLine[] {
  if (gasDoPovoBenefit) {
    const gdpMethod = methods.find((m) => m.systemCode === 'GDP');
    const fromSale = initialPayments?.[0];
    if (fromSale?.storePaymentMethodId) {
      return [{
        key: 'gdp-0',
        storePaymentMethodId: fromSale.storePaymentMethodId,
        amount: parseAmount(fromSale.amount) || saleTotal,
      }];
    }
    if (gdpMethod) {
      return createGdpPaymentLines(gdpMethod.id, methods, saleTotal);
    }
    return [];
  }

  const regular = methods.filter((m) => m.systemCode !== 'GDP');
  if (initialPayments?.length) {
    return initialPayments.map((p, index) => ({
      key: `init-${index}`,
      storePaymentMethodId:
        p.storePaymentMethodId
        ?? regular.find((m) => m.systemCode === p.method)?.id
        ?? regular[0]?.id
        ?? '',
      amount: parseAmount(p.amount),
    }));
  }
  return createDefaultPaymentLines(regular, saleTotal);
}

export function FinishPaymentsModal({
  visible,
  saleId,
  storeId,
  saleTotal: initialSaleTotal,
  gasDoPovoBenefit = false,
  itemQuantity = 1,
  initialUnitPrice,
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
  const [gdpUnitPrice, setGdpUnitPrice] = useState('');
  const openSessionRef = useRef<string | null>(null);

  const parsedUnitPrice = Math.max(0, Number(gdpUnitPrice.replace(',', '.')) || 0);
  const deliveryFee = gasDoPovoBenefit && initialUnitPrice != null
    ? Math.max(0, initialSaleTotal - initialUnitPrice * itemQuantity)
    : 0;
  const saleTotal = gasDoPovoBenefit && parsedUnitPrice > 0
    ? parsedUnitPrice * itemQuantity + deliveryFee
    : initialSaleTotal;

  const gdpMethodId = methods.find((m) => m.systemCode === 'GDP')?.id;

  useEffect(() => {
    if (!visible) {
      openSessionRef.current = null;
      return;
    }

    const sessionKey = `${saleId}:${saleTotal}:${gasDoPovoBenefit}`;
    if (openSessionRef.current === sessionKey) return;
    openSessionRef.current = sessionKey;

    setError('');
    setMethodsError('');
    setLoadingMethods(true);
    if (gasDoPovoBenefit && initialUnitPrice != null) {
      setGdpUnitPrice(String(initialUnitPrice));
    }

    const activeOnly = gasDoPovoBenefit ? 'false' : 'true';
    let cancelled = false;

    api<StorePaymentMethodOption[]>(
      `/stores/${storeId}/payment-methods?activeOnly=${activeOnly}`,
    )
      .then((rows) => {
        if (cancelled) return;
        setMethods(rows);
        setLines(buildInitialLines(rows, saleTotal, gasDoPovoBenefit, initialPayments));
      })
      .catch((err) => {
        if (cancelled) return;
        setMethods([]);
        setLines([]);
        setMethodsError(err instanceof Error ? err.message : 'Erro ao carregar formas de pagamento');
      })
      .finally(() => {
        if (!cancelled) setLoadingMethods(false);
      });

    return () => {
      cancelled = true;
    };
    // initialPayments é lido apenas na abertura do modal (guardado por openSessionRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, storeId, saleId, initialSaleTotal, gasDoPovoBenefit, initialUnitPrice]);

  useEffect(() => {
    if (!visible || !gasDoPovoBenefit || !gdpMethodId) return;
    setLines(createGdpPaymentLines(gdpMethodId, methods, saleTotal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleTotal, visible, gasDoPovoBenefit, gdpMethodId, methods]);

  async function handleConfirm() {
    if (gasDoPovoBenefit) {
      if (!gdpMethodId) {
        setError('Forma GDP não configurada nesta loja. Contate o gestor.');
        return;
      }
      if (parsedUnitPrice <= 0) {
        setError('Informe um preço válido para o benefício Gás do Povo.');
        return;
      }
      if (!paymentsMatchTotal([{ key: 'gdp', storePaymentMethodId: gdpMethodId, amount: saleTotal }], saleTotal)) {
        setError('O valor do benefício Gás do Povo deve ser igual ao total da venda.');
        return;
      }
    } else if (!paymentsMatchTotal(lines, saleTotal)) {
      setError(getPaymentLinesSumErrorMessage(lines, saleTotal));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = gasDoPovoBenefit && gdpMethodId
        ? [{ storePaymentMethodId: gdpMethodId, amount: saleTotal }]
        : paymentLinesToPayload(lines);
      const unitPricePayload = gasDoPovoBenefit && parsedUnitPrice > 0 ? parsedUnitPrice : undefined;
      await onConfirm(payload, unitPricePayload);
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
            {gasDoPovoBenefit ? (
              <View style={styles.priceSection}>
                <Text style={styles.priceLabel}>Preço unitário (GDP)</Text>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="decimal-pad"
                  value={gdpUnitPrice}
                  onChangeText={setGdpUnitPrice}
                  placeholder="0,00"
                  placeholderTextColor={colors.textFaint}
                />
                <Text style={styles.priceHint}>
                  Total: {saleTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </Text>
              </View>
            ) : null}
            <SalePaymentsEditor
              methods={methods}
              lines={lines}
              onChange={setLines}
              saleTotal={saleTotal}
              loadingMethods={loadingMethods}
              methodsError={methodsError}
              gdpLocked={gasDoPovoBenefit}
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
  priceSection: { marginBottom: spacing.md, gap: spacing.xs },
  priceLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  priceInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  priceHint: { fontSize: 13, color: colors.textMuted },
  error: { marginTop: spacing.sm, fontSize: 13, color: colors.dangerText },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
});
