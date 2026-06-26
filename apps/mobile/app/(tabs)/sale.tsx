import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MOBILE_APPROVAL_LABELS, type PaginatedResponse } from '@gas-erp/shared';
import { Badge, Button, Card, Loading, StateMessage } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

interface Store {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  storeSettings?: { price: number | string }[];
}

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  addresses?: {
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    complement?: string | null;
    landmark?: string | null;
  }[];
}

interface PendingSale {
  id: string;
  createdAt: string;
  total: number | string;
  mobileApproval: string;
  status: string;
  customer?: { name: string } | null;
  items: { quantity: number; product: { name: string } }[];
}

type Fulfillment = 'DELIVERY' | 'PICKUP';

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value) || 0;
}

export default function NewSaleScreen() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pending, setPending] = useState<PendingSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [storeId, setStoreId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [fulfillment, setFulfillment] = useState<Fulfillment>('DELIVERY');
  const [notes, setNotes] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('SP');

  const loadData = useCallback(async () => {
    const [storeList, pendingList] = await Promise.all([
      api<Store[]>('/stores'),
      api<PendingSale[]>('/sales/mobile/mine'),
    ]);
    setStores(storeList);
    setPending(pendingList);

    const nextStoreId =
      storeId && storeList.some((s) => s.id === storeId)
        ? storeId
        : storeList[0]?.id ?? user?.storeIds[0] ?? '';
    setStoreId(nextStoreId);

    if (nextStoreId) {
      const productRes = await api<PaginatedResponse<Product>>(
        `/products?storeId=${nextStoreId}&pageSize=100`,
      );
      setProducts(productRes.data);
      if (!productId && productRes.data[0]) {
        setProductId(productRes.data[0].id);
      }
    }
  }, [storeId, productId, user?.storeIds]);

  useEffect(() => {
    loadData()
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!storeId) return;
    api<PaginatedResponse<Product>>(`/products?storeId=${storeId}&pageSize=100`)
      .then((res) => {
        setProducts(res.data);
        setProductId(res.data[0]?.id ?? '');
      })
      .catch(() => undefined);
  }, [storeId]);

  async function searchCustomers() {
    if (!customerSearch.trim()) {
      setCustomers([]);
      return;
    }
    const res = await api<PaginatedResponse<Customer>>(
      `/customers?search=${encodeURIComponent(customerSearch.trim())}&pageSize=10`,
    );
    setCustomers(res.data);
  }

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomers([]);
    setCustomerSearch(customer.name);
    const addr = customer.addresses?.[0];
    if (addr && fulfillment === 'DELIVERY') {
      setDeliveryStreet(addr.street ?? '');
      setDeliveryNumber(addr.number ?? '');
      setDeliveryNeighborhood(addr.neighborhood ?? '');
      setDeliveryCity(addr.city ?? '');
      setDeliveryState(addr.state ?? 'SP');
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }

  async function submitSale() {
    setError('');
    setSuccess('');

    if (!storeId) {
      setError('Selecione a loja.');
      return;
    }
    if (!productId) {
      setError('Selecione um produto.');
      return;
    }

    const product = products.find((p) => p.id === productId);
    const unitPrice = toNumber(product?.storeSettings?.[0]?.price);
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    if (unitPrice <= 0) {
      setError('Produto sem preço cadastrado nesta loja.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/sales/mobile', {
        method: 'POST',
        body: {
          storeId,
          customerId: selectedCustomer?.id,
          fulfillmentType: fulfillment,
          notes: notes.trim() || undefined,
          items: [{ productId, quantity: qty, unitPrice }],
          deliveryStreet: fulfillment === 'DELIVERY' ? deliveryStreet : undefined,
          deliveryNumber: fulfillment === 'DELIVERY' ? deliveryNumber : undefined,
          deliveryNeighborhood: fulfillment === 'DELIVERY' ? deliveryNeighborhood : undefined,
          deliveryCity: fulfillment === 'DELIVERY' ? deliveryCity : undefined,
          deliveryState: fulfillment === 'DELIVERY' ? deliveryState : undefined,
        },
      });
      setSuccess('Venda enviada — aguardando aprovação da loja.');
      setNotes('');
      setSelectedCustomer(null);
      setCustomerSearch('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a venda.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading label="Carregando..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <Text style={styles.title}>Nova venda</Text>
        <Text style={styles.subtitle}>Envie para aprovação da loja</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Loja</Text>
          {stores.length <= 1 ? (
            <Text style={styles.value}>{stores[0]?.name ?? '—'}</Text>
          ) : (
            <View style={styles.chips}>
              {stores.map((store) => (
                <Pressable
                  key={store.id}
                  onPress={() => setStoreId(store.id)}
                  style={[styles.chip, storeId === store.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, storeId === store.id && styles.chipTextActive]}>
                    {store.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <TextInput
            style={styles.input}
            value={customerSearch}
            onChangeText={setCustomerSearch}
            placeholder="Buscar por nome ou telefone"
            placeholderTextColor={colors.textFaint}
            onSubmitEditing={searchCustomers}
          />
          <Button label="Buscar cliente" variant="secondary" onPress={searchCustomers} />
          {customers.length > 0 ? (
            <View style={styles.customerList}>
              {customers.map((c) => (
                <Pressable key={c.id} onPress={() => selectCustomer(c)} style={styles.customerRow}>
                  <Text style={styles.customerName}>{c.name}</Text>
                  {c.phone ? <Text style={styles.customerPhone}>{c.phone}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Produto</Text>
          <View style={styles.chips}>
            {products.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setProductId(p.id)}
                style={[styles.chip, productId === p.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, productId === p.id && styles.chipTextActive]}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Quantidade</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor={colors.textFaint}
          />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Entrega</Text>
          <View style={styles.chips}>
            <Pressable
              onPress={() => setFulfillment('DELIVERY')}
              style={[styles.chip, fulfillment === 'DELIVERY' && styles.chipActive]}
            >
              <Text style={[styles.chipText, fulfillment === 'DELIVERY' && styles.chipTextActive]}>
                Entrega
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFulfillment('PICKUP')}
              style={[styles.chip, fulfillment === 'PICKUP' && styles.chipActive]}
            >
              <Text style={[styles.chipText, fulfillment === 'PICKUP' && styles.chipTextActive]}>
                Portaria
              </Text>
            </Pressable>
          </View>

          {fulfillment === 'DELIVERY' ? (
            <View style={styles.addressFields}>
              <TextInput style={styles.input} value={deliveryStreet} onChangeText={setDeliveryStreet} placeholder="Rua" placeholderTextColor={colors.textFaint} />
              <TextInput style={styles.input} value={deliveryNumber} onChangeText={setDeliveryNumber} placeholder="Número" placeholderTextColor={colors.textFaint} />
              <TextInput style={styles.input} value={deliveryNeighborhood} onChangeText={setDeliveryNeighborhood} placeholder="Bairro" placeholderTextColor={colors.textFaint} />
              <TextInput style={styles.input} value={deliveryCity} onChangeText={setDeliveryCity} placeholder="Cidade" placeholderTextColor={colors.textFaint} />
            </View>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Observações</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Opcional"
            placeholderTextColor={colors.textFaint}
            multiline
          />
        </Card>

        <Button
          label={submitting ? 'Enviando...' : 'Enviar venda'}
          onPress={submitSale}
          loading={submitting}
          disabled={submitting}
        />

        <Text style={styles.pendingTitle}>Minhas vendas pendentes</Text>
        {pending.length === 0 ? (
          <StateMessage emoji="📋" title="Nenhuma pendente" subtitle="Suas vendas aguardando aprovação aparecem aqui." />
        ) : (
          <FlatList
            data={pending}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.pendingList}
            renderItem={({ item }) => (
              <Card style={styles.pendingCard}>
                <View style={styles.pendingHeader}>
                  <Badge
                    label={MOBILE_APPROVAL_LABELS.PENDING}
                    tone="warning"
                  />
                  <Text style={styles.pendingDate}>
                    {new Date(item.createdAt).toLocaleString('pt-BR')}
                  </Text>
                </View>
                <Text style={styles.pendingCustomer}>
                  {item.customer?.name ?? 'Cliente não identificado'}
                </Text>
                <Text style={styles.pendingItems}>
                  {item.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ')}
                </Text>
                <Text style={styles.pendingTotal}>
                  Total: R$ {toNumber(item.total).toFixed(2)}
                </Text>
              </Card>
            )}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  error: {
    color: colors.dangerText,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
    fontSize: 14,
  },
  success: {
    color: colors.successText,
    backgroundColor: colors.successBg,
    padding: spacing.md,
    borderRadius: radius.md,
    fontSize: 14,
  },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  value: { fontSize: 15, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  customerList: { gap: spacing.xs },
  customerRow: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customerName: { fontSize: 14, fontWeight: '600', color: colors.text },
  customerPhone: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addressFields: { gap: spacing.sm, marginTop: spacing.sm },
  pendingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
  },
  pendingList: { gap: spacing.md },
  pendingCard: { gap: spacing.xs },
  pendingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingDate: { fontSize: 11, color: colors.textFaint },
  pendingCustomer: { fontSize: 15, fontWeight: '700', color: colors.text },
  pendingItems: { fontSize: 13, color: colors.textMuted },
  pendingTotal: { fontSize: 13, fontWeight: '600', color: colors.text },
});
