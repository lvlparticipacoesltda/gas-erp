import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  MOBILE_APPROVAL_LABELS,
  PAYMENT_METHOD_LABELS,
  getPaymentLinesSumErrorMessage,
  type PaginatedResponse,
  getSaleDisplayStatus,
} from '@gas-erp/shared';
import {
  SalePaymentsEditor,
  createDefaultPaymentLines,
  createGdpPaymentLines,
  paymentLinesToPayload,
  paymentsMatchTotal,
  type PaymentLine,
  type StorePaymentMethodOption,
} from '@/components/SalePaymentsEditor';
import { Badge, Button, Card, Loading, StateMessage } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { getCurrentDeliveryAddress } from '@/lib/location';
import { fetchAddressByCep, formatCep, normalizeCepDigits } from '@/lib/viacep';
import { colors, radius, spacing } from '@/theme';

interface Store {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  storeSettings?: { price: number | string; deliveryFee?: number | string }[];
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
    zipCode?: string | null;
    complement?: string | null;
    landmark?: string | null;
  }[];
}

interface MobileSaleRow {
  id: string;
  createdAt: string;
  total: number | string;
  mobileApproval: string;
  status: string;
  gasDoPovoBenefit?: boolean;
  store?: { id: string; name: string; code: string };
  customer?: { name: string } | null;
  items: { quantity: number; product: { name: string } }[];
}

type Fulfillment = 'DELIVERY' | 'PICKUP';

const emptyNewCustomer = {
  name: '',
  phone: '',
  zipCode: '',
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
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function productPrice(product: Product): number {
  return toNumber(product.storeSettings?.[0]?.price);
}

function productDeliveryFee(product: Product | undefined): number {
  return product ? toNumber(product.storeSettings?.[0]?.deliveryFee) : 0;
}

export default function NewSaleScreen() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [mySales, setMySales] = useState<MobileSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [storeId, setStoreId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [paymentMethods, setPaymentMethods] = useState<StorePaymentMethodOption[]>([]);
  const [allPaymentMethods, setAllPaymentMethods] = useState<StorePaymentMethodOption[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [gasDoPovoBenefit, setGasDoPovoBenefit] = useState(false);
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [paymentMethodsError, setPaymentMethodsError] = useState('');
  const [fulfillment, setFulfillment] = useState<Fulfillment>('DELIVERY');
  const [notes, setNotes] = useState('');
  const [deliveryZipCode, setDeliveryZipCode] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('SP');
  const [deliveryLandmark, setDeliveryLandmark] = useState('');
  const [loadingGps, setLoadingGps] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const lastFetchedCep = useRef('');

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );
  const catalogUnitPrice = selectedProduct ? productPrice(selectedProduct) : 0;
  const unitPrice = Math.max(0, Number(unitPriceInput.replace(',', '.')) || 0);
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const lineTotal = unitPrice * qty;
  const deliveryFee =
    fulfillment === 'DELIVERY' && selectedProduct ? productDeliveryFee(selectedProduct) : 0;
  const saleTotal = lineTotal + deliveryFee;

  const loadData = useCallback(async () => {
    const [storeList, salesList] = await Promise.all([
      api<Store[]>('/stores'),
      api<MobileSaleRow[]>('/sales/mobile/mine'),
    ]);
    setStores(storeList);
    setMySales(salesList);

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

  const gdpPaymentMethod = allPaymentMethods.find((m) => m.systemCode === 'GDP');
  const regularPaymentMethods = paymentMethods;

  useEffect(() => {
    if (!storeId) {
      setPaymentMethods([]);
      setAllPaymentMethods([]);
      setPaymentLines([]);
      return;
    }
    setPaymentLines([]);
    setLoadingPaymentMethods(true);
    setPaymentMethodsError('');
    api<StorePaymentMethodOption[]>(`/stores/${storeId}/payment-methods?activeOnly=false`)
      .then((rows) => {
        setAllPaymentMethods(rows);
        const regular = rows.filter((m) => m.systemCode !== 'GDP' && m.enabled !== false);
        setPaymentMethods(regular);
        if (!gasDoPovoBenefit) {
          setPaymentLines(createDefaultPaymentLines(regular, saleTotal));
        }
      })
      .catch((err) => {
        setPaymentMethods([]);
        setAllPaymentMethods([]);
        setPaymentLines([]);
        setPaymentMethodsError(
          err instanceof Error ? err.message : 'Erro ao carregar formas de pagamento',
        );
      })
      .finally(() => setLoadingPaymentMethods(false));
    // Recarrega formas ao trocar de loja; saleTotal é aplicado no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    if (!gasDoPovoBenefit) return;
    if (gdpPaymentMethod) {
      setPaymentLines(createGdpPaymentLines(gdpPaymentMethod.id, allPaymentMethods, saleTotal));
    } else {
      setPaymentLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasDoPovoBenefit, gdpPaymentMethod?.id, saleTotal, allPaymentMethods.length]);

  function toggleGdpBenefit() {
    setGasDoPovoBenefit((current) => !current);
  }

  useEffect(() => {
    if (gasDoPovoBenefit) return;
    setPaymentLines((current) => {
      if (current.length === 0) {
        return createDefaultPaymentLines(regularPaymentMethods, saleTotal);
      }
      if (current.length === 1) {
        return [{ ...current[0], amount: saleTotal }];
      }
      return current;
    });
  }, [saleTotal, regularPaymentMethods, gasDoPovoBenefit]);

  useEffect(() => {
    if (!selectedProduct) {
      setUnitPriceInput('');
      return;
    }
    setUnitPriceInput(catalogUnitPrice > 0 ? String(catalogUnitPrice) : '');
  }, [productId, catalogUnitPrice, selectedProduct]);

  const searchCustomers = useCallback(async (query: string) => {
    const term = query.trim();
    if (!term || !storeId) {
      setCustomers([]);
      return;
    }
    setSearchingCustomers(true);
    try {
      const res = await api<PaginatedResponse<Customer>>(
        `/customers?storeId=${storeId}&search=${encodeURIComponent(term)}&pageSize=10`,
      );
      setCustomers(res.data);
    } catch {
      setCustomers([]);
    } finally {
      setSearchingCustomers(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (selectedCustomer) return;
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomers([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchCustomers(term);
    }, 400);
    return () => clearTimeout(timer);
  }, [customerSearch, selectedCustomer, searchCustomers]);

  function applyAddressFields(addr: {
    zipCode?: string | null;
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    landmark?: string | null;
  }) {
    if (addr.zipCode) setDeliveryZipCode(formatCep(addr.zipCode));
    setDeliveryStreet(addr.street ?? '');
    setDeliveryNumber(addr.number ?? '');
    setDeliveryNeighborhood(addr.neighborhood ?? '');
    setDeliveryCity(addr.city ?? '');
    setDeliveryState(addr.state?.slice(0, 2).toUpperCase() || 'SP');
    setDeliveryLandmark(addr.landmark ?? '');
  }

  async function lookupCep(rawCep: string, target: 'delivery' | 'newCustomer') {
    const digits = normalizeCepDigits(rawCep);
    if (digits.length !== 8 || digits === lastFetchedCep.current) return;

    setCepLoading(true);
    setCepError('');
    try {
      const result = await fetchAddressByCep(digits);
      if (!result) {
        setCepError('CEP não encontrado.');
        lastFetchedCep.current = '';
        return;
      }
      lastFetchedCep.current = digits;
      const formatted = formatCep(digits);
      if (target === 'delivery') {
        setDeliveryZipCode(formatted);
        setDeliveryStreet(result.logradouro || deliveryStreet);
        setDeliveryNeighborhood(result.bairro || deliveryNeighborhood);
        setDeliveryCity(result.localidade || deliveryCity);
        setDeliveryState(result.uf || deliveryState);
      } else {
        setNewCustomer((f) => ({
          ...f,
          zipCode: formatted,
          street: result.logradouro || f.street,
          neighborhood: result.bairro || f.neighborhood,
          city: result.localidade || f.city,
          state: result.uf || f.state,
        }));
      }
    } catch {
      setCepError('Não foi possível consultar o CEP.');
      lastFetchedCep.current = '';
    } finally {
      setCepLoading(false);
    }
  }

  function handleDeliveryCepChange(text: string) {
    const formatted = formatCep(text);
    setDeliveryZipCode(formatted);
    setCepError('');
    const digits = normalizeCepDigits(formatted);
    if (digits.length !== 8) {
      lastFetchedCep.current = '';
      return;
    }
    void lookupCep(formatted, 'delivery');
  }

  function handleNewCustomerCepChange(text: string) {
    const formatted = formatCep(text);
    setNewCustomer((f) => ({ ...f, zipCode: formatted }));
    setCepError('');
    const digits = normalizeCepDigits(formatted);
    if (digits.length !== 8) {
      lastFetchedCep.current = '';
      return;
    }
    void lookupCep(formatted, 'newCustomer');
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
          storeId,
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim() || undefined,
          addresses: [
            {
              street: newCustomer.street.trim(),
              number: newCustomer.number.trim() || undefined,
              neighborhood: newCustomer.neighborhood.trim() || undefined,
              city: newCustomer.city.trim(),
              state: newCustomer.state.trim().slice(0, 2).toUpperCase() || 'SP',
              zipCode: normalizeCepDigits(newCustomer.zipCode) || undefined,
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
      setError('Informe um preço unitário válido.');
      return;
    }
    if (fulfillment === 'DELIVERY' && !deliveryStreet.trim() && !deliveryCity.trim()) {
      setError('Informe o endereço de entrega ou use sua localização.');
      return;
    }
    if (paymentLines.length === 0 && !gasDoPovoBenefit) {
      setError('Nenhuma forma de pagamento disponível nesta loja.');
      return;
    }
    if (!gasDoPovoBenefit && !paymentsMatchTotal(paymentLines, saleTotal)) {
      setError(getPaymentLinesSumErrorMessage(paymentLines, saleTotal));
      return;
    }
    const usesGdp =
      gasDoPovoBenefit
      || paymentLines.some((line) => {
        const method = allPaymentMethods.find((m) => m.id === line.storePaymentMethodId);
        return method?.systemCode === 'GDP';
      });
    const itemMethodId = !gasDoPovoBenefit && paymentLines.length === 1
      ? paymentLines[0]?.storePaymentMethodId
      : undefined;
    setSubmitting(true);
    try {
      await api('/sales/mobile', {
        method: 'POST',
        body: {
          storeId,
          customerId: selectedCustomer?.id,
          fulfillmentType: fulfillment,
          notes: notes.trim() || undefined,
          gasDoPovoBenefit: usesGdp && (gasDoPovoBenefit || paymentLines.length === 1),
          items: [{
            productId,
            quantity: qty,
            unitPrice,
            storePaymentMethodId: itemMethodId,
          }],
          payments: gasDoPovoBenefit
            ? gdpPaymentMethod
              ? [{ storePaymentMethodId: gdpPaymentMethod.id, amount: saleTotal }]
              : [{ method: 'GDP', amount: saleTotal }]
            : paymentLinesToPayload(paymentLines),
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
      setGasDoPovoBenefit(false);
      setUnitPriceInput(catalogUnitPrice > 0 ? String(catalogUnitPrice) : '');
      setPaymentLines(createDefaultPaymentLines(paymentMethods, saleTotal));
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
              onChangeText={setCustomerSearch}
              placeholder="Buscar por nome ou telefone"
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => void searchCustomers(customerSearch)}
            />
            {searchingCustomers ? (
              <Text style={styles.hint}>Buscando clientes...</Text>
            ) : customerSearch.trim().length >= 2 && customers.length === 0 ? (
              <Text style={styles.hint}>Nenhum cliente encontrado. Cadastre um novo abaixo.</Text>
            ) : null}
            <View style={styles.rowButtons}>
              <Button
                label="Novo cliente"
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
                  value={newCustomer.zipCode}
                  onChangeText={handleNewCustomerCepChange}
                  placeholder="CEP"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                  maxLength={9}
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
        <View style={styles.productList}>
          {products.map((p) => {
            const price = productPrice(p);
            const selected = productId === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setProductId(p.id)}
                style={[styles.productCard, selected && styles.productCardActive]}
              >
                <Text style={[styles.productName, selected && styles.productNameActive]}>
                  {p.name}
                </Text>
                <Text style={[styles.productPrice, selected && styles.productPriceActive]}>
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
        <Text style={styles.label}>
          {gasDoPovoBenefit ? 'Preço unitário (GDP)' : 'Preço unitário'}
        </Text>
        <TextInput
          style={styles.input}
          value={unitPriceInput}
          onChangeText={setUnitPriceInput}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={colors.textFaint}
        />
        {catalogUnitPrice > 0 && !gasDoPovoBenefit ? (
          <Text style={styles.hint}>Catálogo: {formatCurrency(catalogUnitPrice)}</Text>
        ) : null}
        {unitPrice > 0 ? (
          <View style={styles.priceBox}>
            <Text style={styles.priceLine}>
              Produto: {qty}x {formatCurrency(unitPrice)} = {formatCurrency(lineTotal)}
            </Text>
            {deliveryFee > 0 ? (
              <Text style={styles.priceLine}>Taxa entrega: {formatCurrency(deliveryFee)}</Text>
            ) : null}
            <Text style={styles.priceTotal}>Total: {formatCurrency(saleTotal)}</Text>
          </View>
        ) : null}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Benefício Gás do Povo</Text>
        <Pressable
          onPress={toggleGdpBenefit}
          style={[styles.gdpToggle, gasDoPovoBenefit && styles.gdpToggleActive]}
        >
          <Text style={[styles.gdpToggleTitle, gasDoPovoBenefit && styles.gdpToggleTitleActive]}>
            {gasDoPovoBenefit ? 'Sim — pagamento via GDP' : 'Não — toque para marcar como sim'}
          </Text>
          <Text style={[styles.gdpToggleHint, gasDoPovoBenefit && styles.gdpToggleHintActive]}>
            {gasDoPovoBenefit
              ? 'Ajuste o preço unitário acima; o pagamento fica como GDP'
              : 'Você pode ajustar o preço unitário do produto acima'}
          </Text>
        </Pressable>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Formas de pagamento</Text>
        <SalePaymentsEditor
          methods={allPaymentMethods}
          lines={paymentLines}
          onChange={setPaymentLines}
          saleTotal={saleTotal}
          disabled={submitting || saleTotal <= 0 || gasDoPovoBenefit}
          loadingMethods={loadingPaymentMethods}
          methodsError={paymentMethodsError}
          gdpLocked={gasDoPovoBenefit}
          showGdpOption={Boolean(gdpPaymentMethod)}
        />
        {gasDoPovoBenefit ? (
          <Text style={styles.hint}>
            Pagamento: {PAYMENT_METHOD_LABELS.GDP} — {formatCurrency(saleTotal)}
          </Text>
        ) : (
          <Text style={styles.hint}>
            Para misturar GDP com outra forma, use “+ Adicionar forma” e escolha GDP em uma das linhas.
          </Text>
        )}
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
            <Text style={styles.label}>CEP</Text>
            <TextInput
              style={styles.input}
              value={deliveryZipCode}
              onChangeText={handleDeliveryCepChange}
              placeholder="00000-000"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              maxLength={9}
            />
            {cepLoading ? <Text style={styles.hint}>Buscando CEP...</Text> : null}
            {cepError ? <Text style={styles.cepError}>{cepError}</Text> : null}
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
            <TextInput
              style={styles.input}
              value={deliveryState}
              onChangeText={(text) => setDeliveryState(text.slice(0, 2).toUpperCase())}
              placeholder="UF"
              placeholderTextColor={colors.textFaint}
              maxLength={2}
              autoCapitalize="characters"
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
        label={submitting ? 'Enviando...' : `Enviar venda — ${formatCurrency(saleTotal)}`}
        onPress={submitSale}
        loading={submitting}
        disabled={submitting || saleTotal <= 0}
      />

      <Text style={styles.pendingTitle}>Minhas vendas no app</Text>
      {mySales.length === 0 ? (
        <StateMessage
          emoji="📋"
          title="Nenhuma venda ainda"
          subtitle="As vendas que você registrar pelo app aparecem aqui."
        />
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
          data={mySales}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scroll}
          ListHeaderComponent={formHeader}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => {
            const display = getSaleDisplayStatus({
              status: item.status,
              mobileApproval: item.mobileApproval,
            });
            return (
              <Card style={styles.pendingCard}>
                <View style={styles.pendingHeader}>
                  <View style={styles.pendingBadges}>
                    <Badge label={display.label} tone={display.tone} />
                    {item.gasDoPovoBenefit ? (
                      <Badge label="GDP" tone="warning" />
                    ) : null}
                  </View>
                  <Text style={styles.pendingDate}>
                    {new Date(item.createdAt).toLocaleString('pt-BR')}
                  </Text>
                </View>
                {item.store ? (
                  <Text style={styles.pendingStore}>
                    {item.store.name}
                    {item.store.code ? ` · ${item.store.code}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.pendingCustomer}>
                  {item.customer?.name ?? 'Cliente não identificado'}
                </Text>
                <Text style={styles.pendingItems}>
                  {item.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ')}
                </Text>
                <Text style={styles.pendingTotal}>Total: {formatCurrency(toNumber(item.total))}</Text>
                {item.mobileApproval === 'PENDING' ? (
                  <Text style={styles.hint}>{MOBILE_APPROVAL_LABELS.PENDING}</Text>
                ) : null}
              </Card>
            );
          }}
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
  hint: { fontSize: 12, color: colors.textMuted },
  cepError: { fontSize: 12, color: colors.dangerText },
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
  productList: { gap: spacing.sm },
  productCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productCardActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  productName: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  productNameActive: { color: '#FFFFFF' },
  productPrice: { fontSize: 15, fontWeight: '700', color: colors.primary },
  productPriceActive: { color: '#FFFFFF' },
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
  priceBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    gap: 4,
  },
  priceLine: { fontSize: 13, color: colors.textMuted },
  priceTotal: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  gdpToggle: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  gdpToggleActive: {
    borderColor: colors.primary,
    backgroundColor: '#FFF4ED',
  },
  gdpToggleTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  gdpToggleTitleActive: { color: colors.primary },
  gdpToggleHint: { fontSize: 12, color: colors.textMuted },
  gdpToggleHintActive: { color: colors.textMuted },
  pendingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
  },
  pendingCard: { gap: spacing.xs },
  pendingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flex: 1 },
  pendingDate: { fontSize: 11, color: colors.textFaint },
  pendingStore: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  pendingCustomer: { fontSize: 15, fontWeight: '700', color: colors.text },
  pendingItems: { fontSize: 13, color: colors.textMuted },
  pendingTotal: { fontSize: 13, fontWeight: '600', color: colors.text },
  separator: { height: spacing.md },
});
