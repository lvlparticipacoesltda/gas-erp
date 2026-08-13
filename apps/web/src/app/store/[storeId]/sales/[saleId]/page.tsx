'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { Alert, Badge, Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { formatSaleAddress, parsePrice } from '@/lib/sale-utils';
import {
  SalePaymentsEditor,
  createDefaultPaymentLines,
  paymentsMatchTotal,
  salePaymentLinesToPayload,
  type SalePaymentLine,
  type StorePaymentMethodOption,
} from '@/components/sale-payments-editor';
import {
  SaleItemPaymentsEditor,
  paymentMethodsForSale,
} from '@/components/sale-item-payments-editor';
import {
  SaleItemsEditor,
  storeCatalogPrice,
  type CatalogProduct,
  type EditableSaleLine,
} from '@/components/sale-items-editor';
import {
  BACKDATE_APPROVAL_LABELS,
  MOBILE_APPROVAL_LABELS,
  canManageSales,
  canEditSaleItems,
  canApproveMobileSales,
  getPaymentLinesSumErrorMessage,
  hasScreenPermission,
  formatSaleDateLabel,
  getSaleDelivererName,
  getSaleDisplayStatus,
  PAYMENT_METHOD_LABELS,
  SALE_CHANNEL_LABELS,
  SALE_STATUS_LABELS,
  SALE_STATUSES,
  formatWaitTime,
  getElapsedWaitingSeconds,
  getRouteDurationSeconds,
  getWaitTimeSeconds,
  isDelivererAssignableForSale,
  allItemsHavePaymentMethod,
  buildPaymentAllocationsFromItems,
  type DelivererTimeClockStatus,
  type PaginatedResponse,
} from '@gas-erp/shared';

interface SaleDetail {
  id: string;
  createdAt: string;
  saleDate?: string;
  status: string;
  backdateApproval?: string;
  backdateRequestNotes?: string | null;
  backdateRejectionReason?: string | null;
  backdateApprovedAt?: string | null;
  backdateApprovedBy?: { id: string; name: string } | null;
  mobileApproval?: string;
  mobileRejectionReason?: string | null;
  mobileApprovedAt?: string | null;
  mobileApprovedBy?: { id: string; name: string } | null;
  createdByDeliverer?: { user: { name: string } } | null;
  channel: string;
  total: number | string;
  gasDoPovoBenefit?: boolean;
  deliveryFee?: number | string;
  deliveryFeeStorePaymentMethod?: { id: string; label: string; systemCode: string | null } | null;
  notes?: string | null;
  canceledReason?: string | null;
  canceledAt?: string | null;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  customer?: { id?: string; name: string; phone?: string | null } | null;
  deliverer?: { id: string; user: { name: string } } | null;
  attendant?: { id: string; name: string; email?: string } | null;
  items: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number | string;
    product: { name: string };
    storePaymentMethod?: { id: string; label: string; systemCode: string | null } | null;
  }[];
  payments: { method: string; amount: number | string; storePaymentMethodId?: string | null }[];
  delivery?: { id: string; status: string; startedAt?: string | null; completedAt?: string | null } | null;
  statusLogs: {
    status: string;
    createdAt: string;
    notes?: string | null;
    user?: { id: string; name: string; email?: string } | null;
  }[];
  backdateLogs?: {
    action: string;
    createdAt: string;
    notes?: string | null;
    user?: { id: string; name: string } | null;
  }[];
  mobileLogs?: {
    action: string;
    createdAt: string;
    notes?: string | null;
    user?: { id: string; name: string } | null;
  }[];
}

interface Deliverer {
  id: string;
  status: string;
  availableStoreId?: string | null;
  pendingDeliveryCount?: number;
  timeClockStatus?: DelivererTimeClockStatus | null;
  user: { name: string; active?: boolean };
}

export default function SaleDetailPage() {
  const { storeId, saleId } = useParams<{ storeId: string; saleId: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [status, setStatus] = useState('');
  const [delivererId, setDelivererId] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [mobileRejectReason, setMobileRejectReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [backdateAction, setBackdateAction] = useState<'approve' | 'reject' | null>(null);
  const [mobileAction, setMobileAction] = useState<'approve' | 'reject' | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<StorePaymentMethodOption[]>([]);
  const [paymentLines, setPaymentLines] = useState<SalePaymentLine[]>([]);
  const [editingPayments, setEditingPayments] = useState(false);
  const [savingPayments, setSavingPayments] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [itemLines, setItemLines] = useState<EditableSaleLine[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [customerPriceByProduct, setCustomerPriceByProduct] = useState<Record<string, number>>({});
  const [itemPaymentByProduct, setItemPaymentByProduct] = useState(false);
  const [deliveryFeeMethodId, setDeliveryFeeMethodId] = useState('');

  function mapSalePaymentsToLines(
    s: SaleDetail,
    methods: StorePaymentMethodOption[],
  ): SalePaymentLine[] {
    const saleTotal = parsePrice(s.total);
    if (s.gasDoPovoBenefit) {
      const gdpMethod = methods.find((m) => m.systemCode === 'GDP');
      const fromSale = s.payments[0];
      if (fromSale?.storePaymentMethodId) {
        return [{
          key: 'gdp-0',
          storePaymentMethodId: fromSale.storePaymentMethodId,
          amount: parsePrice(fromSale.amount) || saleTotal,
        }];
      }
      if (gdpMethod) {
        return [{ key: 'gdp-0', storePaymentMethodId: gdpMethod.id, amount: saleTotal }];
      }
      return [];
    }

    const regularMethods = methods.filter((m) => m.systemCode !== 'GDP');
    if (!s.payments.length) {
      return createDefaultPaymentLines(regularMethods, saleTotal);
    }
    return s.payments.map((p, index) => ({
      key: `pay-${index}`,
      storePaymentMethodId:
        p.storePaymentMethodId
        ?? regularMethods.find((m) => m.systemCode === p.method)?.id
        ?? regularMethods[0]?.id
        ?? '',
      amount: parsePrice(p.amount),
    }));
  }

  async function load() {
    const [s, d] = await Promise.all([
      api<SaleDetail>(`/sales/${saleId}`, {}, getToken()),
      api<Deliverer[]>(`/deliverers?storeId=${storeId}`, {}, getToken()),
    ]);
    const methods = await api<StorePaymentMethodOption[]>(
      `/stores/${storeId}/payment-methods?activeOnly=false`,
      {},
      getToken(),
    );
    setSale(s);
    setPaymentMethods(methods);
    setPaymentLines(mapSalePaymentsToLines(s, methods));
    setEditingPayments(false);
    setEditingItems(false);
    const terminal = s.status === 'DELIVERED' || s.status === 'PORTARIA';
    const current = getStoredUser<{ role: string }>();
    const manager = current ? canManageSales(current.role) : false;
    setStatus(terminal && manager && s.status !== 'CANCELLED' ? 'CANCELLED' : s.status);
    setDelivererId(s.deliverer?.id ?? '');
    setDeliverers(d);
  }

  useEffect(() => {
    load();
  }, [saleId, storeId]);

  async function saveStatus() {
    if (!sale) return;
    if (status === 'CANCELLED' && !cancelReason.trim()) {
      setError('Informe o motivo do cancelamento.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api(`/sales/${saleId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          delivererId: status === 'IN_DELIVERY' && delivererId ? delivererId : undefined,
          canceledReason: status === 'CANCELLED' ? cancelReason : undefined,
        }),
      }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar venda');
    } finally {
      setSaving(false);
    }
  }

  async function approveBackdate() {
    if (!sale) return;
    setError('');
    setBackdateAction('approve');
    try {
      await api(`/sales/${saleId}/backdate/approve`, { method: 'POST' }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar venda');
    } finally {
      setBackdateAction(null);
    }
  }

  async function rejectBackdate() {
    if (!sale) return;
    if (!rejectReason.trim()) {
      setError('Informe o motivo da rejeição.');
      return;
    }
    setError('');
    setBackdateAction('reject');
    try {
      await api(`/sales/${saleId}/backdate/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar venda');
    } finally {
      setBackdateAction(null);
    }
  }

  async function approveMobile() {
    if (!sale) return;
    setError('');
    setMobileAction('approve');
    try {
      await api(`/sales/${saleId}/mobile/approve`, { method: 'POST' }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar venda');
    } finally {
      setMobileAction(null);
    }
  }

  async function rejectMobile() {
    if (!sale) return;
    if (!mobileRejectReason.trim()) {
      setError('Informe o motivo da rejeição.');
      return;
    }
    setError('');
    setMobileAction('reject');
    try {
      await api(`/sales/${saleId}/mobile/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: mobileRejectReason.trim() }),
      }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar venda');
    } finally {
      setMobileAction(null);
    }
  }

  async function savePayments() {
    if (!sale) return;
    const saleTotal = parsePrice(sale.total);
    if (!paymentsMatchTotal(paymentLines, saleTotal)) {
      setError(getPaymentLinesSumErrorMessage(paymentLines, saleTotal));
      return;
    }
    setError('');
    setSavingPayments(true);
    try {
      await api(`/sales/${saleId}/payments`, {
        method: 'PATCH',
        body: JSON.stringify({ payments: salePaymentLinesToPayload(paymentLines) }),
      }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar pagamentos');
    } finally {
      setSavingPayments(false);
    }
  }

  function saleItemsToLines(s: SaleDetail): EditableSaleLine[] {
    const byProduct = new Map<string, EditableSaleLine>();
    for (const item of s.items) {
      const existing = byProduct.get(item.productId);
      if (existing) {
        existing.quantity += Math.max(1, Math.floor(Number(item.quantity) || 1));
      } else {
        byProduct.set(item.productId, {
          productId: item.productId,
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          unitPrice: parsePrice(item.unitPrice),
          storePaymentMethodId: item.storePaymentMethod?.id,
        });
      }
    }
    return [...byProduct.values()];
  }

  function resolveEditUnitPrice(productId: string): number {
    const custom = customerPriceByProduct[productId];
    if (custom != null) return custom;
    const product = products.find((p) => p.id === productId);
    return storeCatalogPrice(product);
  }

  function applyItemLines(next: EditableSaleLine[]) {
    setItemLines(next);
    if (itemPaymentByProduct) return;
    const nextTotal =
      next.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      + parsePrice(sale?.deliveryFee);
    setPaymentLines((current) => {
      if (current.length === 1) {
        return [{ ...current[0], amount: nextTotal }];
      }
      return current;
    });
  }

  async function startEditItems() {
    if (!sale) return;
    setError('');
    setEditingPayments(false);
    const byProduct = sale.items.some((item) => item.storePaymentMethod?.id);
    setItemPaymentByProduct(byProduct);
    setItemLines(saleItemsToLines(sale));
    setPaymentLines(mapSalePaymentsToLines(sale, paymentMethods));
    setDeliveryFeeMethodId(sale.deliveryFeeStorePaymentMethod?.id ?? '');
    setEditingItems(true);

    try {
      const catalog = await api<PaginatedResponse<CatalogProduct>>(
        `/products?storeId=${storeId}&pageSize=100`,
        {},
        getToken(),
      );
      setProducts(catalog.data);
    } catch {
      setProducts([]);
    }

    if (sale.customer?.id) {
      try {
        const map = await api<Record<string, number>>(
          `/customers/${sale.customer.id}/product-prices/map?storeId=${storeId}`,
          {},
          getToken(),
        );
        setCustomerPriceByProduct(map);
      } catch {
        setCustomerPriceByProduct({});
      }
    } else {
      setCustomerPriceByProduct({});
    }
  }

  async function saveItems() {
    if (!sale) return;
    if (itemLines.length === 0) {
      setError('Adicione pelo menos um produto.');
      return;
    }
    if (itemLines.some((item) => item.unitPrice <= 0)) {
      setError('Informe um preço válido para todos os produtos.');
      return;
    }
    const nextTotal =
      itemLines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      + parsePrice(sale.deliveryFee);
    if (nextTotal <= 0) {
      setError('O total da venda deve ser maior que zero.');
      return;
    }

    if (itemPaymentByProduct) {
      if (!allItemsHavePaymentMethod(itemLines)) {
        setError('Defina a forma de pagamento em todos os produtos.');
        return;
      }
    } else if (!paymentsMatchTotal(paymentLines, nextTotal)) {
      setError(getPaymentLinesSumErrorMessage(paymentLines, nextTotal));
      return;
    }

    setError('');
    setSavingItems(true);
    try {
      await api(`/sales/${saleId}/items`, {
        method: 'PATCH',
        body: JSON.stringify({
          items: itemLines.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            storePaymentMethodId: itemPaymentByProduct
              ? item.storePaymentMethodId
              : undefined,
          })),
          payments: itemPaymentByProduct
            ? buildPaymentAllocationsFromItems(
                itemLines.map((item) => ({
                  storePaymentMethodId: item.storePaymentMethodId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                })),
                parsePrice(sale.deliveryFee),
                deliveryFeeMethodId || sale.deliveryFeeStorePaymentMethod?.id || null,
              )
            : salePaymentLinesToPayload(paymentLines),
          deliveryFeeStorePaymentMethodId: itemPaymentByProduct
            ? (deliveryFeeMethodId || sale.deliveryFeeStorePaymentMethod?.id || undefined)
            : undefined,
        }),
      }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar itens da venda');
    } finally {
      setSavingItems(false);
    }
  }

  if (!sale) {
    return <PageLoader />;
  }

  const address = formatSaleAddress({
    street: sale.deliveryStreet,
    number: sale.deliveryNumber,
    neighborhood: sale.deliveryNeighborhood,
    city: sale.deliveryCity,
    state: sale.deliveryState,
  });
  const display = getSaleDisplayStatus(sale);
  const currentUser = getStoredUser<{ role: string; permissions?: string[] }>();
  const isManager = currentUser ? canManageSales(currentUser.role) : false;
  const isMaster = currentUser ? canEditSaleItems(currentUser.role) : false;
  const isFinance = currentUser?.role === 'FINANCE';
  const hasSalesScreen = currentUser
    ? hasScreenPermission(currentUser.role, currentUser.permissions, 'store.sales')
    : false;
  const canApproveMobile = currentUser ? canApproveMobileSales(currentUser.role) : false;
  const isPendingBackdate = sale.backdateApproval === 'PENDING';
  const isPendingMobile = sale.mobileApproval === 'PENDING';
  const isTerminal = sale.status === 'DELIVERED' || sale.status === 'PORTARIA';
  const canEdit =
    !isPendingBackdate &&
    !isPendingMobile &&
    sale.status !== 'CANCELLED' &&
    (!isTerminal || isManager);
  const cancelLog = sale.statusLogs.find((log) => log.status === 'CANCELLED');
  const editableStatuses: string[] =
    isTerminal && isManager
      ? ['CANCELLED']
      : SALE_STATUSES.filter((s) => s !== 'DRAFT' && s !== 'PORTARIA');
  const statusSelectValue = editableStatuses.includes(status)
    ? status
    : editableStatuses[0] ?? '';
  const statusChanged = statusSelectValue !== sale.status;
  const delivererChanged =
    statusSelectValue === 'IN_DELIVERY'
    && !!delivererId
    && delivererId !== (sale.deliverer?.id ?? '');
  const cancelReasonReady = statusSelectValue !== 'CANCELLED' || cancelReason.trim().length > 0;

  const canEditPayments =
    sale.status !== 'CANCELLED'
    && (isManager || isFinance || (hasSalesScreen && !isTerminal));
  const canEditItems =
    isMaster
    && sale.status !== 'CANCELLED'
    && !isPendingBackdate
    && !isPendingMobile
    && sale.backdateApproval !== 'REJECTED'
    && sale.mobileApproval !== 'REJECTED';
  const assignableDeliverers = deliverers.filter(
    (d) => isDelivererAssignableForSale(d, storeId).assignable || d.id === sale.deliverer?.id,
  );
  const saleTotal = parsePrice(sale.total);
  const editItemsTotal =
    itemLines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    + parsePrice(sale.deliveryFee);
  const defaultItemPaymentMethodId =
    (
      paymentMethodsForSale(paymentMethods).find((m) => m.systemCode === 'CASH')
      ?? paymentMethodsForSale(paymentMethods)[0]
    )?.id ?? null;
  const editorProducts: CatalogProduct[] = (() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of sale.items) {
      if (!byId.has(item.productId)) {
        byId.set(item.productId, { id: item.productId, name: item.product.name });
      }
    }
    return [...byId.values()];
  })();

  return (
    <>
        <Link href={`/store/${storeId}/sales`} className="text-sm text-brand hover:underline">
          ← Voltar ao histórico
        </Link>

        <PageHeader
          title={`Venda ${formatSaleDateLabel(sale.saleDate ?? sale.createdAt)}`}
          subtitle={sale.customer?.name ?? 'Cliente não identificado'}
        />

        {isPendingBackdate && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Aguardando aprovação de data retroativa</p>
            {sale.backdateRequestNotes && (
              <p className="mt-1">Motivo informado: {sale.backdateRequestNotes}</p>
            )}
            {isManager && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={backdateAction !== null}
                    onClick={approveBackdate}
                  >
                    {backdateAction === 'approve' ? 'Aprovando...' : 'Aprovar venda'}
                  </Button>
                </div>
                <div>
                  <Label>Motivo da rejeição</Label>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Explique por que a venda não será aceita"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-2"
                    disabled={backdateAction !== null}
                    onClick={rejectBackdate}
                  >
                    {backdateAction === 'reject' ? 'Rejeitando...' : 'Rejeitar venda'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {isPendingMobile && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Aguardando aprovação de venda do app</p>
            {sale.createdByDeliverer?.user.name && (
              <p className="mt-1">Criada por: {sale.createdByDeliverer.user.name}</p>
            )}
            {canApproveMobile && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={mobileAction !== null}
                    onClick={approveMobile}
                  >
                    {mobileAction === 'approve' ? 'Aprovando...' : 'Aprovar venda'}
                  </Button>
                </div>
                <div>
                  <Label>Motivo da rejeição</Label>
                  <Input
                    value={mobileRejectReason}
                    onChange={(e) => setMobileRejectReason(e.target.value)}
                    placeholder="Explique por que a venda não será aceita"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-2"
                    disabled={mobileAction !== null}
                    onClick={rejectMobile}
                  >
                    {mobileAction === 'reject' ? 'Rejeitando...' : 'Rejeitar venda'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <Alert className="mb-4">{error}</Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 font-semibold">Detalhes</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><Badge tone={display.tone}>{display.label}</Badge></dd></div>
              {sale.backdateApproval && sale.backdateApproval !== 'NOT_REQUIRED' && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Data retroativa</dt>
                  <dd>
                    {BACKDATE_APPROVAL_LABELS[sale.backdateApproval as keyof typeof BACKDATE_APPROVAL_LABELS] ?? sale.backdateApproval}
                  </dd>
                </div>
              )}
              {sale.mobileApproval && sale.mobileApproval !== 'NOT_REQUIRED' && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Venda do app</dt>
                  <dd>
                    {MOBILE_APPROVAL_LABELS[sale.mobileApproval as keyof typeof MOBILE_APPROVAL_LABELS] ?? sale.mobileApproval}
                  </dd>
                </div>
              )}
              <div className="flex justify-between"><dt className="text-slate-500">Data da venda</dt><dd>{formatSaleDateLabel(sale.saleDate ?? sale.createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Canal</dt><dd>{SALE_CHANNEL_LABELS[sale.channel] ?? sale.channel}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Registrado por</dt><dd>{sale.attendant?.name ?? sale.createdByDeliverer?.user.name ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Registrado em</dt><dd>{formatDate(sale.createdAt)}</dd></div>
              {sale.backdateApprovedBy && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Aprovada por</dt>
                  <dd>{sale.backdateApprovedBy.name}</dd>
                </div>
              )}
              {sale.backdateRejectionReason && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Motivo rejeição</dt>
                  <dd>{sale.backdateRejectionReason}</dd>
                </div>
              )}
              {sale.mobileApprovedBy && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Aprovada (app) por</dt>
                  <dd>{sale.mobileApprovedBy.name}</dd>
                </div>
              )}
              {sale.mobileRejectionReason && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Motivo rejeição (app)</dt>
                  <dd>{sale.mobileRejectionReason}</dd>
                </div>
              )}
              <div className="flex justify-between"><dt className="text-slate-500">Entregador</dt><dd>{getSaleDelivererName(sale) ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Total</dt><dd className="font-semibold">{formatCurrency(sale.total)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Benefício Gás do Povo</dt>
                <dd>{sale.gasDoPovoBenefit ? 'Sim' : 'Não'}</dd>
              </div>
              {Number(sale.deliveryFee ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Taxa entrega</dt>
                  <dd>{formatCurrency(sale.deliveryFee ?? 0)}</dd>
                </div>
              )}
              {sale.delivery?.startedAt && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Espera até a rota</dt>
                    <dd>{formatWaitTime(getWaitTimeSeconds(sale.createdAt, sale.delivery.startedAt))}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Tempo em rota</dt>
                    <dd>
                      {formatWaitTime(
                        getRouteDurationSeconds(sale.delivery.startedAt, sale.delivery.completedAt)
                          ?? (sale.delivery.status === 'IN_PROGRESS'
                            ? getElapsedWaitingSeconds(sale.delivery.startedAt)
                            : null),
                      )}
                    </dd>
                  </div>
                </>
              )}
              {sale.delivery && (sale.delivery.startedAt || sale.delivery.completedAt) && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="font-semibold text-emerald-900">Entrega pelo aplicativo</p>
                  {sale.delivery.startedAt && (
                    <p className="mt-1 text-emerald-800">
                      Rota iniciada: {formatDateTime(sale.delivery.startedAt)}
                    </p>
                  )}
                  {sale.delivery.completedAt ? (
                    <p className="mt-1 text-base font-semibold text-emerald-900">
                      Finalizada no app: {formatDateTime(sale.delivery.completedAt)}
                    </p>
                  ) : sale.delivery.status === 'IN_PROGRESS' ? (
                    <p className="mt-1 font-medium text-amber-800">Rota em andamento</p>
                  ) : null}
                </div>
              )}
              {address && <div><dt className="text-slate-500">Endereço</dt><dd className="mt-1">{address}</dd></div>}
              {sale.notes && <div><dt className="text-slate-500">Obs.</dt><dd className="mt-1">{sale.notes}</dd></div>}
              {sale.status === 'CANCELLED' && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="font-medium text-red-800">Cancelamento</p>
                  {sale.canceledAt && (
                    <p className="mt-1 text-red-700">Em {formatDate(sale.canceledAt)}</p>
                  )}
                  {cancelLog?.user && (
                    <p className="mt-1 text-red-700">Por {cancelLog.user.name}</p>
                  )}
                  {(sale.canceledReason || cancelLog?.notes) && (
                    <p className="mt-1 text-red-700">
                      Motivo: {sale.canceledReason || cancelLog?.notes}
                    </p>
                  )}
                </div>
              )}
            </dl>

            <h3 className="mb-2 mt-6 font-medium">Itens</h3>
            {canEditItems && editingItems ? (
              <div className="space-y-4">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Se a venda já baixou estoque, aumentar ou diminuir a quantidade ajusta o estoque automaticamente.
                </p>
                <SaleItemsEditor
                  products={editorProducts}
                  items={itemLines}
                  onChange={applyItemLines}
                  resolveUnitPrice={resolveEditUnitPrice}
                  defaultPaymentMethodId={defaultItemPaymentMethodId}
                  assignPaymentMethod={itemPaymentByProduct}
                />
                {itemPaymentByProduct ? (
                  <SaleItemPaymentsEditor
                    methods={paymentMethods}
                    items={itemLines.map((item) => ({
                      key: item.productId,
                      label: (products.find((p) => p.id === item.productId)?.name
                        ?? sale.items.find((s) => s.productId === item.productId)?.product.name
                        ?? 'Produto'),
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      storePaymentMethodId: item.storePaymentMethodId || '',
                    }))}
                    onChangeItemMethod={(productId, storePaymentMethodId) => {
                      applyItemLines(
                        itemLines.map((item) =>
                          item.productId === productId
                            ? { ...item, storePaymentMethodId }
                            : item,
                        ),
                      );
                    }}
                    deliveryFee={parsePrice(sale.deliveryFee)}
                    deliveryFeeStorePaymentMethodId={deliveryFeeMethodId}
                    onChangeDeliveryFeeMethod={setDeliveryFeeMethodId}
                  />
                ) : (
                  <SalePaymentsEditor
                    methods={paymentMethods}
                    lines={paymentLines}
                    onChange={setPaymentLines}
                    saleTotal={editItemsTotal}
                    gdpLocked={false}
                    gdpMethodId={paymentMethods.find((m) => m.systemCode === 'GDP')?.id}
                  />
                )}
                <p className="text-sm font-semibold text-slate-900">
                  Novo total: {formatCurrency(editItemsTotal)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={savingItems} onClick={saveItems}>
                    {savingItems ? 'Salvando...' : 'Salvar itens'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={savingItems}
                    onClick={() => {
                      setItemLines(saleItemsToLines(sale));
                      setPaymentLines(mapSalePaymentsToLines(sale, paymentMethods));
                      setEditingItems(false);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ul className="space-y-1 text-sm">
                  {sale.items.flatMap((item, itemIndex) => {
                    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
                    return Array.from({ length: qty }, (_, unitIndex) => (
                      <li key={`${itemIndex}-${unitIndex}`}>
                        1x {item.product.name} — {formatCurrency(item.unitPrice)}
                        {item.storePaymentMethod?.label ? (
                          <span className="text-slate-500"> · {item.storePaymentMethod.label}</span>
                        ) : null}
                      </li>
                    ));
                  })}
                </ul>
                {canEditItems ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3"
                    onClick={startEditItems}
                  >
                    Editar itens
                  </Button>
                ) : null}
              </>
            )}

            <h3 className="mb-2 mt-4 font-medium">Pagamentos</h3>
            {editingItems ? (
              <p className="text-sm text-slate-500">
                Os pagamentos serão atualizados junto com os itens.
              </p>
            ) : canEditPayments && editingPayments ? (
              <div className="space-y-3">
                <SalePaymentsEditor
                  methods={paymentMethods}
                  lines={paymentLines}
                  onChange={setPaymentLines}
                  saleTotal={saleTotal}
                  gdpLocked={false}
                  gdpMethodId={paymentMethods.find((m) => m.systemCode === 'GDP')?.id}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={savingPayments}
                    onClick={savePayments}
                  >
                    {savingPayments ? 'Salvando...' : 'Salvar pagamentos'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={savingPayments}
                    onClick={() => {
                      setPaymentLines(mapSalePaymentsToLines(sale, paymentMethods));
                      setEditingPayments(false);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ul className="space-y-1 text-sm">
                  {sale.payments.map((p, i) => (
                    <li key={i}>
                      {PAYMENT_METHOD_LABELS[p.method] ?? p.method}: {formatCurrency(p.amount)}
                    </li>
                  ))}
                </ul>
                {canEditPayments ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      setPaymentLines(mapSalePaymentsToLines(sale, paymentMethods));
                      setEditingPayments(true);
                    }}
                  >
                    Editar pagamentos
                  </Button>
                ) : null}
              </>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">Alterar status</h2>
            {!canEdit ? (
              <p className="text-sm text-slate-500">
                {sale.status === 'CANCELLED'
                  ? 'Venda cancelada — histórico preservado para auditoria.'
                  : 'Esta venda não pode ser alterada pelo seu perfil.'}
              </p>
            ) : (
              <div className="space-y-4">
                {isTerminal && isManager && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Como gerente/master, você pode cancelar esta venda finalizada. O cancelamento ficará registrado com seu usuário e motivo.
                  </p>
                )}
                <div>
                  <Label>Novo status</Label>
                  <Select value={statusSelectValue} onChange={(e) => setStatus(e.target.value)}>
                    {editableStatuses.map((s) => (
                      <option key={s} value={s}>{SALE_STATUS_LABELS[s]}</option>
                    ))}
                  </Select>
                </div>

                {status === 'IN_DELIVERY' && (
                  <div>
                    <Label>Entregador</Label>
                    <Select value={delivererId} onChange={(e) => setDelivererId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {assignableDeliverers.map((d) => (
                        <option key={d.id} value={d.id}>{d.user.name}</option>
                      ))}
                    </Select>
                    {assignableDeliverers.length === 0 && (
                      <p className="mt-2 text-sm text-amber-800">
                        Nenhum entregador disponível para nova atribuição.
                      </p>
                    )}
                  </div>
                )}

                {statusSelectValue === 'CANCELLED' && (
                  <div>
                    <Label>Motivo do cancelamento</Label>
                    <Input
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Descreva o motivo do cancelamento"
                      required
                    />
                  </div>
                )}

                {!statusChanged && delivererChanged && (
                  <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    O entregador será alterado e a entrega reenviada para aceite do novo entregador.
                  </p>
                )}

                <Button
                  type="button"
                  disabled={
                    saving
                    || !statusSelectValue
                    || (!statusChanged && !delivererChanged)
                    || !cancelReasonReady
                  }
                  onClick={saveStatus}
                >
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </div>
            )}

            {(sale.backdateLogs?.length ?? 0) > 0 && (
              <>
                <h3 className="mb-2 mt-8 font-medium">Histórico de data retroativa</h3>
                <ul className="space-y-3 text-sm">
                  {sale.backdateLogs!.map((log) => (
                    <li key={`${log.action}-${log.createdAt}`} className="rounded-lg border border-slate-100 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{log.action}</span>
                        <span className="text-slate-500">{formatDate(log.createdAt)}</span>
                      </div>
                      {log.user && (
                        <p className="mt-1 text-slate-600">Por {log.user.name}</p>
                      )}
                      {log.notes && (
                        <p className="mt-1 text-slate-600">{log.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {(sale.mobileLogs?.length ?? 0) > 0 && (
              <>
                <h3 className="mb-2 mt-8 font-medium">Histórico de aprovação (app)</h3>
                <ul className="space-y-3 text-sm">
                  {sale.mobileLogs!.map((log) => (
                    <li key={`${log.action}-${log.createdAt}`} className="rounded-lg border border-slate-100 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{log.action}</span>
                        <span className="text-slate-500">{formatDate(log.createdAt)}</span>
                      </div>
                      {log.user && (
                        <p className="mt-1 text-slate-600">Por {log.user.name}</p>
                      )}
                      {log.notes && (
                        <p className="mt-1 text-slate-600">{log.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="mb-2 mt-8 font-medium">Histórico de status</h3>
            <ul className="space-y-3 text-sm">
              {sale.statusLogs.map((log) => (
                <li key={`${log.status}-${log.createdAt}`} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {SALE_STATUS_LABELS[log.status] ?? log.status}
                    </span>
                    <span className="text-slate-500">{formatDateTime(log.createdAt)}</span>
                  </div>
                  {log.user && (
                    <p className="mt-1 text-slate-600">Por {log.user.name}</p>
                  )}
                  {log.notes && (
                    <p className="mt-1 text-slate-600">Obs.: {log.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
    </>
  );
}
