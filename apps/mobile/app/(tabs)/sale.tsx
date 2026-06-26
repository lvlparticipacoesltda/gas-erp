import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
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
import { getCurrentDeliveryAddress } from '@/lib/location';
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

const emptyNewCustomer = {
  name: '',
  phone: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: 'SP',
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value) || 0;
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

function productPrice(product: Product): number {
  return toNumber(product.storeSettings?.[0]?.price);
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
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [fulfillment, setFulfillment] = useState<Fulfillment>('DELIVERY');
  const [notes, setNotes] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('SP');
  const [deliveryLandmark, setDeliveryLandmark] = useState('');
  const [loadingGps, setLoadingGps] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );
  const unitPrice = selectedProduct ? productPrice(selectedProduct) : 0;
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const lineTotal = unitPrice * qty;

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
      setProductId((current) => current || productRes.data[0]?.id || '');
    }
  }, [storeId, user?.storeIds]);

  useEffect(() => {
    loadData()
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
    // Carregamento inicial apenas
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function applyAddressFields(addr: {
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    landmark?: string | null;
  }) {
    setDeliveryStreet(addr.street ?? '');
    setDeliveryNumber(addr.number ?? '');
    setDeliveryNeighborhood(addr.neighborhood ?? '');
    setDeliveryCity(addr.city ?? '');
    setDeliveryState(addr.state?.slice(0, 2).toUpperCase() || 'SP');
    setDeliveryLandmark(addr.landmark ?? '');
  }

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
    setShowNewCustomer(false);
    const addr = customer.addresses?.[0];
    if (addr && fulfillment === 'DELIVERY') {
      applyAddressFields(addr);
    }
  }

  function clearCustomerSelection() {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setCustomers([]);
  }

  async function createCustomer() {
    setError('');
    if (!newCustomer.name.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }
    if (!newCustomer.street.trim() || !newCustomer.city.trim()) {
      setError('Informe rua e cidade do cliente.');
      return;
    }

    setCreatingCustomer(true);
    try {
      const created = await api<Customer>('/customers', {
        method: 'POST',
        body: {
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim() || undefined,
          addresses: [
            {
              street: newCustomer.street.trim(),
              number: newCustomer.number.trim() || undefined,
              neighborhood: newCustomer.neighborhood.trim() || undefined,
              city: newCustomer.city.trim(),
              state: newCustomer.state.trim().slice(0, 2).toUpperCase() || 'SP',
              isDefault: true,
            },
          ],
        },
      });
      selectCustomer(created);
      setNewCustomer(emptyNewCustomer);
      setShowNewCustomer(false);
      setSuccess('Cliente cadastrado.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível cadastrar o cliente.');
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function useCurrentLocation() {
    setLoadingGps(true);
    setError('');
    try {
      const address = await getCurrentDeliveryAddress();
      if (!address) {
        setError('Não foi possível obter a localização. Verifique as permissões de GPS.');
        return;
      }
      applyAddressFields(address);
      setSuccess('Endereço preenchido com sua localização atual.');
    } catch {
      setError('Erro ao obter localização.');
    } finally {
      setLoadingGps(false);
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
    if (unitPrice <= 0) {
      setError('Produto sem preço cadastrado nesta loja.');
      return;
    }
    if (fulfillment === 'DELIVERY' && !deliveryStreet.trim() && !deliveryCity.trim()) {
      setError('Informe o endereço de entrega ou use sua localização.');
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
          deliveryLandmark: fulfillment === 'DELIVERY' ? deliveryLandmark || undefined : undefined,
        },
      });
      setSuccess('Venda enviada — aguardando aprovação da loja.');
      setNotes('');
      clearCustomerSelection();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a venda.');
    } finally {
      setSubmitting(false);
    }
  }

  const formHeader = (
    <View style={styles.form}>
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
        {selectedCustomer ? (
          <View style={styles.selectedCustomer}>
            <View style={styles.selectedCustomerInfo}>
              <Text style={styles.customerName}>{selectedCustomer.name}</Text>
              {selectedCustomer.phone ? (
                <Text style={styles.customerPhone}>{selectedCustomer.phone}</Text>
              ) : null}
            </View>
            <Button label="Trocar" variant="secondary" onPress={clearCustomerSelection} />
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={customerSearch}
              onChangeText={(text) => {
                setCustomerSearch(text);
                if (customers.length > 0) setCustomers([]);
              }}
              placeholder="Buscar por nome ou telefone"
              placeholderTextColor={colors.textFaint}
              onSubmitEditing={searchCustomers}
              blurOnSubmit={false}
              autoCorrect={false}
            />
            <View style={styles.rowButtons}>
              <Button label="Buscar cliente" variant="secondary" onPress={searchCustomers} />
              <Button
                label={showNewCustomer ? 'Cancelar cadastro' : 'Novo cliente'}
                variant="secondary"
                onPress={() => {
                  setShowNewCustomer((v) => !v);
                  setCustomers([]);
                }}
              />
            </View>
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
            {showNewCustomer ? (
              <View style={styles.newCustomerForm}>
                <Text style={styles.label}>Cadastrar cliente</Text>
                <TextInput
                  style={styles.input}
                  value={newCustomer.name}
                  onChangeText={(text) => setNewCustomer((f) => ({ ...f, name: text }))}
                  placeholder="Nome *"
                  placeholderTextColor={colors.textFaint}
                />
                <TextInput
                  style={styles.input}
                  value={newCustomer.phone}
                  onChangeText={(text) => setNewCustomer((f) => ({ ...f, phone: text }))}
                  placeholder="Telefone"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="phone-pad"
                />
                <TextInput
                  style={styles.input}
                  value={newCustomer.street}
                  onChangeText={(text) => setNewCustomer((f) => ({ ...f, street: text }))}
                  placeholder="Rua *"
                  placeholderTextColor={colors.textFaint}
                />
                <TextInput
                  style={styles.input}
                  value={newCustomer.number}
                  onChangeText={(text) => setNewCustomer((f) => ({ ...f, number: text }))}
                  placeholder="Número"
                  placeholderTextColor={colors.textFaint}
                />
                <TextInput
                  style={styles.input}
                  value={newCustomer.neighborhood}
                  onChangeText={(text) => setNewCustomer((f) => ({ ...f, neighborhood: text }))}
                  placeholder="Bairro"
                  placeholderTextColor={colors.textFaint}
                />
                <TextInput
                  style={styles.input}
                  value={newCustomer.city}
                  onChangeText={(text) => setNewCustomer((f) => ({ ...f, city: text }))}
                  placeholder="Cidade *"
                  placeholderTextColor={colors.textFaint}
                />
                <Button
                  label={creatingCustomer ? 'Salvando...' : 'Salvar e usar cliente'}
                  onPress={createCustomer}
                  loading={creatingCustomer}
                  disabled={creatingCustomer}
                />
              </View>
            ) : null}
          </>
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Produto</Text>
        <View style={styles.chips}>
          {products.map((p) => {
            const price = productPrice(p);
            return (
              <Pressable
                key={p.id}
                onPress={() => setProductId(p.id)}
                style={[styles.chip, productId === p.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, productId === p.id && styles.chipTextActive]}>
                  {p.name}
                </Text>
                <Text style={[styles.chipPrice, productId === p.id && styles.chipTextActive]}>
                  {price > 0 ? formatCurrency(price) : 'Sem preço'}
                </Text>
              </Pressable>
            );
          })}
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
        {unitPrice > 0 ? (
          <Text style={styles.priceSummary}>
            {qty}x {formatCurrency(unitPrice)} = {formatCurrency(lineTotal)}
          </Text>
        ) : null}
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
            <Button
              label={loadingGps ? 'Obtendo localização...' : 'Usar minha localização'}
              variant="secondary"
              onPress={useCurrentLocation}
              loading={loadingGps}
              disabled={loadingGps}
            />
            <TextInput
              style={styles.input}
              value={deliveryStreet}
              onChangeText={setDeliveryStreet}
              placeholder="Rua"
              placeholderTextColor={colors.textFaint}
            />
            <TextInput
              style={styles.input}
              value={deliveryNumber}
              onChangeText={setDeliveryNumber}
              placeholder="Número"
              placeholderTextColor={colors.textFaint}
            />
            <TextInput
              style={styles.input}
              value={deliveryNeighborhood}
              onChangeText={setDeliveryNeighborhood}
              placeholder="Bairro"
              placeholderTextColor={colors.textFaint}
            />
            <TextInput
              style={styles.input}
              value={deliveryCity}
              onChangeText={setDeliveryCity}
              placeholder="Cidade"
              placeholderTextColor={colors.textFaint}
            />
            {deliveryLandmark ? (
              <Text style={styles.gpsHint}>Referência: {deliveryLandmark}</Text>
            ) : null}
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
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading label="Carregando..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <FlatList
          data={pending}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scroll}
          ListHeaderComponent={formHeader}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <Card style={styles.pendingCard}>
              <View style={styles.pendingHeader}>
                <Badge label={MOBILE_APPROVAL_LABELS.PENDING} tone="warning" />
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
              <Text style={styles.pendingTotal}>Total: {formatCurrency(toNumber(item.total))}</Text>
            </Card>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  form: { gap: spacing.md },
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
    gap: 2,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipPrice: { fontSize: 11, fontWeight: '500', color: colors.textFaint },
  chipTextActive: { color: '#FFFFFF' },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  customerList: { gap: spacing.xs },
  customerRow: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectedCustomerInfo: { flex: 1 },
  newCustomerForm: { gap: spacing.sm, marginTop: spacing.sm },
  customerName: { fontSize: 14, fontWeight: '600', color: colors.text },
  customerPhone: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addressFields: { gap: spacing.sm, marginTop: spacing.sm },
  gpsHint: { fontSize: 11, color: colors.textFaint },
  priceSummary: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  pendingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
  },
  pendingCard: { gap: spacing.xs },
  pendingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingDate: { fontSize: 11, color: colors.textFaint },
  pendingCustomer: { fontSize: 15, fontWeight: '700', color: colors.text },
  pendingItems: { fontSize: 13, color: colors.textMuted },
  pendingTotal: { fontSize: 13, fontWeight: '600', color: colors.text },
  separator: { height: spacing.md },
});
