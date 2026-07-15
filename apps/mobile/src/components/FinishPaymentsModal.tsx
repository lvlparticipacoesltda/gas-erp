import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  itemCount?: number;
  initialUnitPrice?: number;
  initialPayments?: { method: string; amount: number | string; storePaymentMethodId?: string | null }[];
  onClose: () => void;
  onMinimizedChange?: (minimized: boolean) => void;
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

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function FinishPaymentsModal({
  visible,
  saleId,
  storeId,
  saleTotal: initialSaleTotal,
  gasDoPovoBenefit = false,
  itemQuantity = 1,
  itemCount = 1,
  initialUnitPrice,
  initialPayments,
  onClose,
  onMinimizedChange,
  onConfirm,
}: FinishPaymentsModalProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [minimized, setMinimized] = useState(false);
  const [methods, setMethods] = useState<StorePaymentMethodOption[]>([]);
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [loading, setLoading] = useState(false);
  const [methodsError, setMethodsError] = useState('');
  const [error, setError] = useState('');
  const [gdpUnitPrice, setGdpUnitPrice] = useState('');
  const openSessionRef = useRef<string | null>(null);

  // O preço unitário GDP só pode ser ajustado em vendas com um único produto.
  // Com mais itens (ex.: "taxa de entrega" como produto), o total é fixo e o
  // backend recusa o ajuste — então não reenviamos o preço unitário.
  const canEditGdpUnitPrice = gasDoPovoBenefit && itemCount === 1 && initialUnitPrice != null;
  const parsedUnitPrice = Math.max(0, Number(gdpUnitPrice.replace(',', '.')) || 0);
  const deliveryFee = canEditGdpUnitPrice
    ? Math.max(0, initialSaleTotal - initialUnitPrice * itemQuantity)
    : 0;
  const saleTotal = canEditGdpUnitPrice && parsedUnitPrice > 0
    ? parsedUnitPrice * itemQuantity + deliveryFee
    : initialSaleTotal;

  const gdpMethodId = methods.find((m) => m.systemCode === 'GDP')?.id;

  function setMinimizedState(next: boolean) {
    setMinimized(next);
    onMinimizedChange?.(next);
  }

  useEffect(() => {
    if (!visible) {
      openSessionRef.current = null;
      setMinimized(false);
      onMinimizedChange?.(false);
      return;
    }
    setMinimizedState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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

    const activeOnly = 'false';
    let cancelled = false;

    api<StorePaymentMethodOption[]>(
      `/stores/${storeId}/payment-methods?activeOnly=${activeOnly}`,
    )
      .then((rows) => {
        if (cancelled) return;
        setMethods(rows);
        setLines(buildInitialLines(rows, saleTotal, false, initialPayments));
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
    // Só sincroniza linha única GDP se o modal ainda não tiver formas mistas.
    setLines((current) => {
      if (current.length > 1) return current;
      return createGdpPaymentLines(gdpMethodId, methods, saleTotal);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleTotal, visible, gasDoPovoBenefit, gdpMethodId, methods]);

  useEffect(() => {
    if (!visible || minimized) return;
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, [visible, minimized]);

  async function handleConfirm() {
    if (gasDoPovoBenefit) {
      if (!gdpMethodId) {
        setError('Forma GDP não configurada nesta loja. Contate o gestor.');
        return;
      }
      if (canEditGdpUnitPrice && parsedUnitPrice <= 0) {
        setError('Informe um preço válido para o benefício Gás do Povo.');
        return;
      }
      // Já não força 100% GDP — entregador pode misturar formas no modal.
    }
    if (!paymentsMatchTotal(lines, saleTotal)) {
      setError(getPaymentLinesSumErrorMessage(lines, saleTotal));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = paymentLinesToPayload(lines);
      const unitPricePayload = canEditGdpUnitPrice && parsedUnitPrice > 0 ? parsedUnitPrice : undefined;
      await onConfirm(payload, unitPricePayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar os pagamentos.');
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  if (minimized) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.minimizedRoot} pointerEvents="box-none">
          <View
            style={[styles.minimizedBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
          >
            <Pressable
              style={styles.minimizedMain}
              onPress={() => setMinimizedState(false)}
              accessibilityRole="button"
              accessibilityLabel="Expandir formas de pagamento"
            >
              <View style={styles.minimizedIcon}>
                <Ionicons name="card-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.minimizedText}>
                <Text style={styles.minimizedTitle}>Pagamentos</Text>
                <Text style={styles.minimizedSubtitle}>{formatBrl(saleTotal)}</Text>
              </View>
              <Ionicons name="chevron-up" size={22} color={colors.text} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8} style={styles.minimizedClose}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fullscreen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Formas de pagamento</Text>
            <Text style={styles.subtitle}>Total: {formatBrl(saleTotal)}</Text>
          </View>
          <Pressable
            onPress={() => setMinimizedState(true)}
            style={styles.headerBtn}
            hitSlop={8}
            accessibilityLabel="Minimizar"
          >
            <Ionicons name="chevron-down" size={24} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={onClose}
            style={styles.headerBtn}
            hitSlop={8}
            accessibilityLabel="Cancelar"
          >
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator
        >
          {canEditGdpUnitPrice ? (
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
                Total: {formatBrl(saleTotal)}
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
            gdpLocked={false}
            showGdpOption
            comfortable
            onAmountFocus={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 15, fontWeight: '600', color: colors.primary },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  priceSection: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  priceLabel: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  priceInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  priceHint: { fontSize: 14, color: colors.textMuted },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  error: { fontSize: 13, color: colors.dangerText, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  minimizedRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  minimizedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  minimizedMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  minimizedIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimizedText: { flex: 1 },
  minimizedTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  minimizedSubtitle: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 2 },
  minimizedClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
});
