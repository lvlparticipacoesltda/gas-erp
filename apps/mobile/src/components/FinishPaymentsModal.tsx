import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import {
  allItemsHavePaymentMethod,
  buildPaymentAllocationsFromItems,
  getPaymentLinesSumErrorMessage,
} from '@gas-erp/shared';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { parseMoneyInput, sanitizeMoneyInput, formatMoneyDraft } from '@/lib/money-input';
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
import {
  SaleItemPaymentsEditor,
  paymentMethodsForSale,
} from '@/components/SaleItemPaymentsEditor';

export interface FinishSaleItem {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  storePaymentMethodId?: string | null;
  productType?: string | null;
}

interface FinishPaymentsModalProps {
  visible: boolean;
  saleId: string;
  storeId: string;
  saleTotal: number;
  deliveryFee?: number;
  gasDoPovoBenefit?: boolean;
  initialPayments?: { method: string; amount: number | string; storePaymentMethodId?: string | null }[];
  items?: FinishSaleItem[];
  deliveryFeeStorePaymentMethodId?: string | null;
  onClose: () => void;
  onConfirm: (payload: {
    payments: { storePaymentMethodId: string; amount: number }[];
    itemUnitPrices?: { id: string; unitPrice: number }[];
    itemPayments?: { id: string; storePaymentMethodId: string }[];
    deliveryFeeStorePaymentMethodId?: string | null;
  }) => Promise<void>;
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
  deliveryFee = 0,
  gasDoPovoBenefit = false,
  initialPayments,
  items = [],
  deliveryFeeStorePaymentMethodId: initialFeeMethodId,
  onClose,
  onConfirm,
}: FinishPaymentsModalProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [methods, setMethods] = useState<StorePaymentMethodOption[]>([]);
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [paymentByProduct, setPaymentByProduct] = useState(false);
  const [itemMethods, setItemMethods] = useState<Record<string, string>>({});
  const [itemUnitPrices, setItemUnitPrices] = useState<Record<string, string>>({});
  const [feeMethodId, setFeeMethodId] = useState('');
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [loading, setLoading] = useState(false);
  const [methodsError, setMethodsError] = useState('');
  const [error, setError] = useState('');
  const openSessionRef = useRef<string | null>(null);

  const deliveryFeeAmount = Math.max(0, deliveryFee);
  const editableItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        unitPrice: parseMoneyInput(itemUnitPrices[item.id] ?? formatMoneyDraft(item.unitPrice)),
      })),
    [items, itemUnitPrices],
  );
  const itemsSubtotal = editableItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const saleTotal = items.length > 0
    ? itemsSubtotal + deliveryFeeAmount
    : initialSaleTotal;

  useEffect(() => {
    if (!visible) {
      openSessionRef.current = null;
      return;
    }

    const sessionKey = `${saleId}:${initialSaleTotal}:${gasDoPovoBenefit}`;
    if (openSessionRef.current === sessionKey) return;
    openSessionRef.current = sessionKey;

    setError('');
    setMethodsError('');
    setLoadingMethods(true);

    const nextPrices: Record<string, string> = {};
    for (const item of items) {
      nextPrices[item.id] = formatMoneyDraft(item.unitPrice);
    }
    setItemUnitPrices(nextPrices);

    let cancelled = false;

    api<StorePaymentMethodOption[]>(
      `/stores/${storeId}/payment-methods?activeOnly=false`,
    )
      .then((rows) => {
        if (cancelled) return;
        setMethods(rows);
        setLines(buildInitialLines(rows, initialSaleTotal, gasDoPovoBenefit, initialPayments));

        const available = paymentMethodsForSale(rows);
        const fallback = available.find((m) => m.systemCode === 'CASH') ?? available[0];
        const nextItemMethods: Record<string, string> = {};
        let hasItemMethods = false;
        for (const item of items) {
          if (item.storePaymentMethodId) {
            nextItemMethods[item.id] = item.storePaymentMethodId;
            hasItemMethods = true;
          } else if (fallback) {
            nextItemMethods[item.id] = fallback.id;
          }
        }
        setItemMethods(nextItemMethods);
        setFeeMethodId(initialFeeMethodId || fallback?.id || '');
        const hasTaxaItem = items.some(
          (item) => (item.productType ?? '').toUpperCase() === 'TAXA',
        );
        // Igual ao painel: TAXA ou vários itens → pagamento por produto.
        setPaymentByProduct(
          hasItemMethods || hasTaxaItem || (items.length > 1 && Boolean(fallback)),
        );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, storeId, saleId, initialSaleTotal, gasDoPovoBenefit]);

  useEffect(() => {
    if (!visible || paymentByProduct) return;
    setLines((current) => {
      if (current.length === 0) return current;
      if (current.length === 1) {
        return [{ ...current[0], amount: saleTotal }];
      }
      return current;
    });
  }, [saleTotal, visible, paymentByProduct]);

  useEffect(() => {
    if (!visible) return;
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, [visible]);

  function buildConfirmPayload() {
    if (editableItems.some((item) => item.unitPrice <= 0)) {
      return { error: 'Informe um preço unitário válido para todos os produtos.' as const };
    }

    const itemUnitPricesPayload = editableItems.map((item) => ({
      id: item.id,
      unitPrice: item.unitPrice,
    }));

    if (paymentByProduct) {
      const itemRows = editableItems.map((item) => ({
        storePaymentMethodId: itemMethods[item.id] || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
      if (!allItemsHavePaymentMethod(itemRows)) {
        return { error: 'Defina a forma de pagamento em todos os produtos.' as const };
      }

      return {
        payload: {
          payments: buildPaymentAllocationsFromItems(
            itemRows,
            deliveryFeeAmount,
            feeMethodId || null,
          ),
          itemUnitPrices: itemUnitPricesPayload,
          itemPayments: editableItems.map((item) => ({
            id: item.id,
            storePaymentMethodId: itemMethods[item.id],
          })),
          deliveryFeeStorePaymentMethodId: feeMethodId || null,
        },
      };
    }

    if (!paymentsMatchTotal(lines, saleTotal)) {
      return { error: getPaymentLinesSumErrorMessage(lines, saleTotal) };
    }

    return {
      payload: {
        payments: paymentLinesToPayload(lines),
        itemUnitPrices: items.length > 0 ? itemUnitPricesPayload : undefined,
      },
    };
  }

  function handleConfirm() {
    const result = buildConfirmPayload();
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    if (!('payload' in result) || !result.payload) return;

    const payload = result.payload;
    const summaryLines = editableItems
      .map((item) => `• ${item.quantity}x ${item.label}: ${formatBrl(item.unitPrice)}`)
      .join('\n');

    Alert.alert(
      'Confirmar valores?',
      `Confirme se os valores estão corretos antes de concluir a entrega.\n\n${summaryLines}\n\nTotal: ${formatBrl(saleTotal)}`,
      [
        { text: 'Revisar', style: 'cancel' },
        {
          text: 'Confirmar e concluir',
          style: 'default',
          onPress: () => {
            void (async () => {
              setLoading(true);
              setError('');
              try {
                await onConfirm(payload);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : 'Não foi possível salvar os pagamentos.',
                );
              } finally {
                setLoading(false);
              }
            })();
          },
        },
      ],
    );
  }

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fullscreen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Concluir entrega</Text>
            <Text style={styles.subtitle}>Total: {formatBrl(saleTotal)}</Text>
          </View>
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
          {editableItems.length > 0 ? (
            <View style={styles.priceSection}>
              <Text style={styles.priceLabel}>Valores dos produtos</Text>
              <Text style={styles.priceHint}>
                Ajuste o preço unitário se necessário antes de concluir.
              </Text>
              {editableItems.map((item) => (
                <View key={item.id} style={styles.itemPriceRow}>
                  <Text style={styles.itemPriceTitle}>
                    {item.quantity}x {item.label}
                  </Text>
                  <TextInput
                    style={styles.priceInput}
                    keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                    value={itemUnitPrices[item.id] ?? ''}
                    onChangeText={(text) => {
                      const sanitized = sanitizeMoneyInput(text);
                      setItemUnitPrices((current) => ({ ...current, [item.id]: sanitized }));
                    }}
                    placeholder="0,00"
                    placeholderTextColor={colors.textFaint}
                  />
                  <Text style={styles.itemPriceSubtotal}>
                    Subtotal: {formatBrl(item.quantity * item.unitPrice)}
                  </Text>
                </View>
              ))}
              {deliveryFeeAmount > 0.009 ? (
                <Text style={styles.priceHint}>
                  Taxa de entrega: {formatBrl(deliveryFeeAmount)}
                </Text>
              ) : null}
              <Text style={styles.priceTotal}>Total: {formatBrl(saleTotal)}</Text>
            </View>
          ) : null}

          {items.length > 0 ? (
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setPaymentByProduct(false)}
                style={[styles.modeChip, !paymentByProduct && styles.modeChipActive]}
              >
                <Text style={[styles.modeChipText, !paymentByProduct && styles.modeChipTextActive]}>
                  Por valor
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPaymentByProduct(true);
                  const available = paymentMethodsForSale(methods);
                  const fallback =
                    available.find((m) => m.systemCode === 'CASH') ?? available[0];
                  if (fallback) {
                    setItemMethods((current) => {
                      const next = { ...current };
                      for (const item of editableItems) {
                        if (!next[item.id]) next[item.id] = fallback.id;
                      }
                      return next;
                    });
                    setFeeMethodId((current) => current || fallback.id);
                  }
                }}
                style={[styles.modeChip, paymentByProduct && styles.modeChipActive]}
              >
                <Text style={[styles.modeChipText, paymentByProduct && styles.modeChipTextActive]}>
                  Por produto
                </Text>
              </Pressable>
            </View>
          ) : null}

          {paymentByProduct && editableItems.length > 0 ? (
            <SaleItemPaymentsEditor
              methods={methods}
              items={editableItems.map((item) => ({
                key: item.id,
                label: item.label,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                storePaymentMethodId: itemMethods[item.id] || '',
              }))}
              onChangeItemMethod={(key, storePaymentMethodId) => {
                setItemMethods((current) => ({ ...current, [key]: storePaymentMethodId }));
              }}
              deliveryFee={deliveryFeeAmount}
              deliveryFeeStorePaymentMethodId={feeMethodId}
              onChangeDeliveryFeeMethod={setFeeMethodId}
            />
          ) : (
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
          )}
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
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  modeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.infoBg,
  },
  modeChipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  modeChipTextActive: { color: colors.primary },
  priceSection: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  priceLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  priceInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  priceHint: { fontSize: 13, color: colors.textMuted },
  priceTotal: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  itemPriceRow: { gap: 6 },
  itemPriceTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  itemPriceSubtotal: { fontSize: 12, color: colors.textMuted },
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
});
