import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BackdateApprovalStatus, DeliveryStatus, MobileApprovalStatus, Prisma, SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createSaleSchema,
  createMobileSaleSchema,
  updateSaleStatusSchema,
  updateSalePaymentsSchema,
  rejectSaleBackdateSchema,
  rejectSaleMobileSchema,
  type CreateSaleInput,
  type CreateMobileSaleInput,
  canManageSales,
  canApproveMobileSales,
  hasScreenPermission,
  resolveSaleBackdateInput,
  toNumber,
  isDelivererAssignableForSale,
  assertSalePaymentsTotal,
  allItemsHavePaymentMethod,
  anyItemHasPaymentMethod,
  buildPaymentAllocationsFromItems,
  type DashboardDateQuery,
  resolveDashboardDateRange,
} from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { StockService } from '../stock/stock.service';
import { AuditService } from '../../common/audit/audit.service';
import { PushService } from '../../common/push/push.service';
import { paginate, paginatedResult } from '../../common/utils/pagination';
import { StorePaymentMethodsService } from '../stores/store-payment-methods.service';
import {
  StoreRealtimeReason,
  StoreRealtimeService,
} from '../../common/realtime/store-realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GeocodingService } from '../../common/geocoding/geocoding.service';

/** Venda com os campos necessários para montar uma notificação master. */
type NotifiableSale = {
  id: string;
  storeId: string;
  total: Prisma.Decimal | number | string;
  channel: string;
  status: SaleStatus;
  canceledReason?: string | null;
  createdAt: Date;
  store?: { id: string; name: string } | null;
  attendant?: { id: string; name: string } | null;
  items?: Array<{
    quantity: Prisma.Decimal | number | string;
    product?: { name?: string | null } | null;
  }> | null;
};

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
    private push: PushService,
    private paymentMethods: StorePaymentMethodsService,
    private realtime: StoreRealtimeService,
    private notifications: NotificationsService,
    private geocoding: GeocodingService,
  ) {}

  /**
   * Geocodifica o endereço de entrega e persiste as coordenadas na venda.
   * Fire-and-forget: não bloqueia nem falha a criação da venda.
   */
  private geocodeSaleDestination(
    saleId: string,
    address: {
      deliveryStreet?: string | null;
      deliveryNumber?: string | null;
      deliveryNeighborhood?: string | null;
      deliveryCity?: string | null;
      deliveryState?: string | null;
    },
  ): void {
    if (
      !address.deliveryStreet?.trim()
      || !address.deliveryCity?.trim()
      || !address.deliveryState?.trim()
    ) {
      return;
    }
    void this.geocoding
      .geocodeAddress({
        street: address.deliveryStreet,
        number: address.deliveryNumber ?? undefined,
        neighborhood: address.deliveryNeighborhood ?? undefined,
        city: address.deliveryCity,
        state: address.deliveryState,
      })
      .then((result) => {
        if (!result) return;
        return this.prisma.sale.update({
          where: { id: saleId },
          data: { deliveryLatitude: result.latitude, deliveryLongitude: result.longitude },
        });
      })
      .catch(() => {
        // Sem coordenadas agora: o backfill acontece na primeira leitura da entrega.
      });
  }

  private notifyStoreRealtime(
    storeId: string,
    organizationId: string,
    reason: StoreRealtimeReason,
  ) {
    try {
      this.realtime.notifyStoreChange(storeId, organizationId, reason);
    } catch {
      // Eventos em tempo real não devem bloquear o fluxo principal.
    }
  }

  /** Snapshot dos produtos vendidos para exibir na notificação. */
  private buildNotificationItems(sale: NotifiableSale) {
    return (sale.items ?? []).map((item) => ({
      name: item.product?.name ?? 'Produto',
      quantity: toNumber(item.quantity),
    }));
  }

  /** Resumo curto dos produtos (ex.: "2x P13, 1x Água"). */
  private summarizeItems(items: Array<{ name: string; quantity: number }>) {
    return items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
  }

  /** Cria notificação master de venda portaria. Best-effort. */
  private async notifyPortariaSale(user: AuthUser, sale: NotifiableSale) {
    const storeName = sale.store?.name ?? 'Unidade';
    const attendantName = sale.attendant?.name ?? user.name;
    const total = toNumber(sale.total);
    const items = this.buildNotificationItems(sale);
    const itemsSummary = this.summarizeItems(items);
    await this.notifications.create({
      organizationId: user.organizationId,
      storeId: sale.storeId,
      type: 'SALE_PORTARIA',
      title: `Venda portaria — ${storeName}`,
      body: itemsSummary || attendantName,
      saleId: sale.id,
      metadata: {
        storeId: sale.storeId,
        storeName,
        attendantName,
        total,
        channel: sale.channel,
        items,
        at: sale.createdAt?.toISOString?.() ?? new Date().toISOString(),
      },
    });
  }

  /** Cria notificação master de venda cancelada. Best-effort. */
  private async notifyCancelledSale(
    user: AuthUser,
    sale: NotifiableSale,
    canceledReason: string | null | undefined,
    previousStatus?: SaleStatus,
  ) {
    const storeName = sale.store?.name ?? 'Unidade';
    const attendantName = sale.attendant?.name ?? '—';
    const total = toNumber(sale.total);
    const items = this.buildNotificationItems(sale);
    await this.notifications.create({
      organizationId: user.organizationId,
      storeId: sale.storeId,
      type: 'SALE_CANCELLED',
      title: `Venda cancelada — ${storeName}`,
      body: canceledReason?.trim() || 'Sem motivo informado',
      saleId: sale.id,
      metadata: {
        storeId: sale.storeId,
        storeName,
        attendantName,
        total,
        channel: sale.channel,
        items,
        canceledReason: canceledReason?.trim() || null,
        canceledByName: user.name,
        previousStatus: previousStatus ?? null,
        at: new Date().toISOString(),
      },
    });
  }

  private saleInclude = {
    store: { select: { id: true, name: true, code: true } },
    customer: true,
    attendant: { select: { id: true, name: true } },
    deliverer: { include: { user: { select: { id: true, name: true } } } },
    backdateApprovedBy: { select: { id: true, name: true } },
    mobileApprovedBy: { select: { id: true, name: true } },
    createdByDeliverer: { include: { user: { select: { id: true, name: true } } } },
    items: {
      include: {
        product: true,
        storePaymentMethod: { select: { id: true, label: true, systemCode: true } },
      },
    },
    deliveryFeeStorePaymentMethod: { select: { id: true, label: true, systemCode: true } },
    payments: { include: { storePaymentMethod: { select: { id: true, label: true, systemCode: true } } } },
    delivery: true,
    statusLogs: {
      orderBy: { createdAt: 'asc' as const },
      include: { user: { select: { id: true, name: true, email: true } } },
    },
    backdateLogs: {
      orderBy: { createdAt: 'asc' as const },
      include: { user: { select: { id: true, name: true } } },
    },
    mobileLogs: {
      orderBy: { createdAt: 'asc' as const },
      include: { user: { select: { id: true, name: true } } },
    },
  };

  async findAll(
    user: AuthUser,
    storeId: string,
    status?: string,
    page = 1,
    pageSize = 20,
    backdatePending?: boolean,
    mobilePending?: boolean,
    dateQuery?: DashboardDateQuery,
    delivererId?: string,
  ) {
    assertStoreAccess(user, storeId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);

    let saleIdsFilter: string[] | undefined;
    if (dateQuery?.date || dateQuery?.dateFrom || dateQuery?.dateTo) {
      let dateFrom: string;
      let dateTo: string;
      try {
        ({ dateFrom, dateTo } = resolveDashboardDateRange(dateQuery));
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Intervalo de datas inválido',
        );
      }

      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM "Sale"
        WHERE "storeId" = ${storeId}
          AND DATE(
            ((COALESCE("saleDate", "createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')
          ) >= ${dateFrom}::date
          AND DATE(
            ((COALESCE("saleDate", "createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')
          ) <= ${dateTo}::date
      `;
      saleIdsFilter = rows.map((row) => row.id);
      if (saleIdsFilter.length === 0) {
        return paginatedResult([], 0, p, ps);
      }
    }

    const where: Prisma.SaleWhereInput = {
      storeId,
      ...(saleIdsFilter ? { id: { in: saleIdsFilter } } : {}),
      ...(status ? { status: status as SaleStatus } : {}),
      ...(backdatePending ? { backdateApproval: 'PENDING' as BackdateApprovalStatus } : {}),
      ...(mobilePending ? { mobileApproval: 'PENDING' as MobileApprovalStatus } : {}),
      ...(delivererId ? { delivererId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take,
        include: this.saleInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);
    return paginatedResult(data, total, p, ps);
  }

  async findOne(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { ...this.saleInclude, store: true },
    });
    if (!sale || sale.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Venda não encontrada');
    }
    assertStoreAccess(user, sale.storeId);
    return sale;
  }

  async create(user: AuthUser, input: unknown) {
    const data = createSaleSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    const isPickupEarly =
      data.fulfillmentType === 'PICKUP' || data.channel === 'IN_STORE';
    const deliveryFee = isPickupEarly
      ? 0
      : await this.resolveDeliveryFee(data.storeId, data.items);

    const itemsTotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice - (item.discount ?? 0),
      0,
    );
    const total = itemsTotal + deliveryFee;

    const {
      resolvedPayments,
      gasDoPovoBenefit,
      deliveryFeeStorePaymentMethodId,
    } = await this.resolveSalePaymentPlan(data.storeId, data.items, deliveryFee, {
      payments: data.payments,
      gasDoPovoBenefit: data.gasDoPovoBenefit,
      deliveryFeeStorePaymentMethodId: data.deliveryFeeStorePaymentMethodId,
    });

    const paidTotal = resolvedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    if (total > 0 && paidTotal < total - 0.009) {
      throw new BadRequestException(
        'Informe o valor do pagamento. Verifique o preço unitário do produto.',
      );
    }

    await this.validateSaleReferences(user, data);

    if (data.channel === 'IN_STORE' && data.fulfillmentType === 'DELIVERY') {
      throw new BadRequestException('Vendas pelo canal portaria não permitem entrega.');
    }

    let backdate;
    try {
      backdate = resolveSaleBackdateInput({
        saleDate: data.saleDate,
        userRole: user.role,
        backdateRequestNotes: data.backdateRequestNotes,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Data da venda inválida.');
    }

    const isPickup = data.fulfillmentType === 'PICKUP' || data.channel === 'IN_STORE';
    const isPendingBackdate = backdate.backdateApproval === 'PENDING';
    const initialStatus = isPendingBackdate
      ? SaleStatus.CONFIRMED
      : isPickup
        ? SaleStatus.PORTARIA
        : SaleStatus.CONFIRMED;
    const channel = isPickup ? 'IN_STORE' : (data.channel ?? 'PHONE');
    const now = new Date();
    const managerAutoApproved = backdate.backdateApproval === 'APPROVED';
    const unitCostByProduct = await this.resolveItemUnitCosts(data.storeId, data.items);

    const created = await this.prisma.sale.create({
      data: {
        storeId: data.storeId,
        customerId: data.customerId,
        attendantId: user.id,
        delivererId: isPickup ? undefined : data.delivererId,
        channel,
        status: initialStatus,
        total,
        gasDoPovoBenefit,
        deliveryFee,
        deliveryFeeStorePaymentMethodId: deliveryFeeStorePaymentMethodId ?? undefined,
        notes: data.notes,
        saleDate: backdate.saleDate,
        backdateApproval: backdate.backdateApproval as BackdateApprovalStatus,
        backdateApprovedAt: managerAutoApproved ? now : undefined,
        backdateApprovedById: managerAutoApproved ? user.id : undefined,
        backdateRequestNotes: backdate.requiresManagerApproval
          ? data.backdateRequestNotes?.trim()
          : undefined,
        deliveryStreet: isPickup ? undefined : data.deliveryStreet || undefined,
        deliveryNumber: isPickup ? undefined : data.deliveryNumber || undefined,
        deliveryComplement: isPickup ? undefined : data.deliveryComplement || undefined,
        deliveryNeighborhood: isPickup ? undefined : data.deliveryNeighborhood || undefined,
        deliveryCity: isPickup ? undefined : data.deliveryCity || undefined,
        deliveryState: isPickup ? undefined : data.deliveryState || undefined,
        deliveryLandmark: isPickup ? undefined : data.deliveryLandmark || undefined,
        confirmedAt: isPendingBackdate ? undefined : now,
        deliveredAt: isPendingBackdate ? undefined : isPickup ? now : undefined,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: unitCostByProduct.get(item.productId) ?? 0,
            discount: item.discount ?? 0,
            total: item.quantity * item.unitPrice - (item.discount ?? 0),
            storePaymentMethodId: item.storePaymentMethodId || undefined,
          })),
        },
        payments: { create: resolvedPayments },
        statusLogs: {
          create: isPendingBackdate
            ? [{ status: SaleStatus.CONFIRMED, userId: user.id, notes: 'Aguardando aprovação de data retroativa' }]
            : isPickup
              ? [{ status: SaleStatus.PORTARIA, userId: user.id }]
              : [{ status: SaleStatus.CONFIRMED, userId: user.id }],
        },
        backdateLogs: {
          create: backdate.backdateApproval !== 'NOT_REQUIRED'
            ? [{
                action: backdate.requiresManagerApproval ? 'REQUESTED' : 'APPROVED',
                userId: user.id,
                notes: data.backdateRequestNotes?.trim() || `Data da venda: ${backdate.saleDateKey}`,
              }]
            : undefined,
        },
      },
      select: { id: true },
    });

    if (!isPickup) {
      this.geocodeSaleDestination(created.id, data);
    }

    let newDelivery: { id: string; delivererId: string | null } | null = null;

    if (!isPendingBackdate) {
      try {
        newDelivery = await this.finalizeSaleFulfillment(
          this.prisma,
          created.id,
          data,
          user.id,
          isPickup,
        );
      } catch (error) {
        await this.rollbackSaleCreate(created.id, data.storeId, [], user.id);
        throw error;
      }
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: created.id },
      include: this.saleInclude,
    });

    if (!sale) {
      throw new BadRequestException('Não foi possível registrar a venda.');
    }

    try {
      await this.audit.log(user, 'CREATE', 'Sale', sale.id, {
        storeId: data.storeId,
        channel,
        status: initialStatus,
        total,
        attendantId: user.id,
        attendantName: user.name,
        customerId: data.customerId ?? null,
        saleDate: backdate.saleDateKey,
        backdateApproval: backdate.backdateApproval,
      });
    } catch {
      // Venda já foi salva; falha de auditoria não deve bloquear o fluxo.
    }

    if (newDelivery?.delivererId) {
      void this.push
        .notifyNewDelivery(newDelivery.delivererId, newDelivery.id)
        .catch(() => undefined);
    }

    this.notifyStoreRealtime(data.storeId, user.organizationId, 'sale_created');

    if (initialStatus === SaleStatus.PORTARIA) {
      await this.notifyPortariaSale(user, sale);
    }

    return sale;
  }

  async createMobile(user: AuthUser, input: unknown) {
    if (user.role !== 'DELIVERER') {
      throw new ForbiddenException('Apenas entregadores podem criar vendas pelo app.');
    }

    const data = createMobileSaleSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    const deliverer = await this.prisma.deliverer.findUnique({
      where: { userId: user.id },
      include: { stores: { where: { storeId: data.storeId } } },
    });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');
    if (deliverer.stores.length === 0) {
      throw new BadRequestException('Você não atende esta unidade.');
    }

    const isPickup = data.fulfillmentType === 'PICKUP';
    const deliveryFee = isPickup
      ? 0
      : await this.resolveDeliveryFee(data.storeId, data.items);

    const itemsTotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice - (item.discount ?? 0),
      0,
    );
    const total = itemsTotal + deliveryFee;

    const {
      resolvedPayments,
      gasDoPovoBenefit,
      deliveryFeeStorePaymentMethodId,
    } = await this.resolveSalePaymentPlan(data.storeId, data.items, deliveryFee, {
      payments: data.payments,
      gasDoPovoBenefit: data.gasDoPovoBenefit,
      deliveryFeeStorePaymentMethodId: data.deliveryFeeStorePaymentMethodId,
    });

    const paidTotal = resolvedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    if (total > 0 && paidTotal < total - 0.009) {
      throw new BadRequestException(
        'Informe o valor do pagamento. Verifique o preço unitário do produto.',
      );
    }

    await this.validateMobileSaleReferences(user, data);

    const unitCostByProduct = await this.resolveItemUnitCosts(data.storeId, data.items);

    const sale = await this.prisma.sale.create({
      data: {
        storeId: data.storeId,
        customerId: data.customerId,
        delivererId: isPickup ? undefined : deliverer.id,
        createdByDelivererId: deliverer.id,
        channel: isPickup ? 'IN_STORE' : 'APP',
        status: SaleStatus.DRAFT,
        total,
        gasDoPovoBenefit,
        deliveryFee,
        deliveryFeeStorePaymentMethodId: deliveryFeeStorePaymentMethodId ?? undefined,
        notes: data.notes,
        mobileApproval: 'PENDING' as MobileApprovalStatus,
        deliveryStreet: isPickup ? undefined : data.deliveryStreet || undefined,
        deliveryNumber: isPickup ? undefined : data.deliveryNumber || undefined,
        deliveryComplement: isPickup ? undefined : data.deliveryComplement || undefined,
        deliveryNeighborhood: isPickup ? undefined : data.deliveryNeighborhood || undefined,
        deliveryCity: isPickup ? undefined : data.deliveryCity || undefined,
        deliveryState: isPickup ? undefined : data.deliveryState || undefined,
        deliveryLandmark: isPickup ? undefined : data.deliveryLandmark || undefined,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: unitCostByProduct.get(item.productId) ?? 0,
            discount: item.discount ?? 0,
            total: item.quantity * item.unitPrice - (item.discount ?? 0),
            storePaymentMethodId: item.storePaymentMethodId || undefined,
          })),
        },
        payments: { create: resolvedPayments },
        statusLogs: {
          create: [{
            status: SaleStatus.DRAFT,
            userId: user.id,
            notes: 'Venda enviada pelo app — aguardando aprovação da loja',
          }],
        },
        mobileLogs: {
          create: [{
            action: 'REQUESTED',
            userId: user.id,
            notes: 'Venda criada pelo entregador no app',
          }],
        },
      },
      include: this.saleInclude,
    });

    if (!isPickup) {
      this.geocodeSaleDestination(sale.id, data);
    }

    try {
      await this.audit.log(user, 'CREATE_MOBILE', 'Sale', sale.id, {
        storeId: data.storeId,
        delivererId: deliverer.id,
        total,
        fulfillmentType: data.fulfillmentType,
      });
    } catch {
      // Auditoria não bloqueia o fluxo.
    }

    this.notifyStoreRealtime(data.storeId, user.organizationId, 'sale_created');

    return sale;
  }

  async findMobilePendingByDeliverer(user: AuthUser) {
    if (user.role !== 'DELIVERER') {
      throw new ForbiddenException('Apenas entregadores podem consultar vendas do app.');
    }

    const deliverer = await this.prisma.deliverer.findUnique({ where: { userId: user.id } });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');

    return this.prisma.sale.findMany({
      where: {
        createdByDelivererId: deliverer.id,
        mobileApproval: { not: 'NOT_REQUIRED' as MobileApprovalStatus },
      },
      include: this.saleInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async approveMobile(user: AuthUser, id: string) {
    if (!canApproveMobileSales(user.role)) {
      throw new ForbiddenException('Sem permissão para aprovar vendas do app.');
    }

    const sale = await this.findOne(user, id);
    if (sale.mobileApproval !== 'PENDING') {
      throw new BadRequestException('Esta venda não está aguardando aprovação do app.');
    }

    const pickup = sale.channel === 'IN_STORE';
    const saleInput = this.buildSaleInputFromExisting(sale, pickup);

    await this.validateSaleReferences(user, saleInput);

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Portaria: baixa estoque na aprovação (venda já finalizada).
      // Entrega pelo app: o entregador já cumpriu no campo → DELIVERED + baixa.
      if (pickup) {
        await this.finalizeSaleFulfillment(tx, sale.id, saleInput, user.id, true);
      } else {
        await this.stockService.deductSaleItems(
          tx,
          sale.storeId,
          saleInput.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          user.id,
          sale.id,
        );

        if (saleInput.delivererId) {
          await tx.delivery.create({
            data: {
              saleId: sale.id,
              delivererId: saleInput.delivererId,
              status: DeliveryStatus.DELIVERED,
              completedAt: now,
            },
          });
          await tx.deliverer.update({
            where: { id: saleInput.delivererId },
            data: { availableStoreId: sale.storeId, status: 'AVAILABLE' },
          });
        }
      }

      const nextStatus = pickup ? SaleStatus.PORTARIA : SaleStatus.DELIVERED;
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          mobileApproval: 'APPROVED',
          mobileApprovedAt: now,
          mobileApprovedById: user.id,
          attendantId: user.id,
          confirmedAt: now,
          deliveredAt: now,
          status: nextStatus,
        },
      });

      await tx.saleMobileApprovalLog.create({
        data: {
          saleId: sale.id,
          userId: user.id,
          action: 'APPROVED',
          notes: 'Venda do app aprovada',
        },
      });

      if (pickup && sale.status !== SaleStatus.PORTARIA) {
        await tx.saleStatusLog.create({
          data: {
            saleId: sale.id,
            status: SaleStatus.PORTARIA,
            userId: user.id,
            notes: 'Aprovada — retirada na portaria',
          },
        });
      } else if (!pickup && sale.status !== SaleStatus.DELIVERED) {
        await tx.saleStatusLog.create({
          data: {
            saleId: sale.id,
            status: SaleStatus.DELIVERED,
            userId: user.id,
            notes: 'Venda do app aprovada — já entregue',
          },
        });
      }
    });

    try {
      await this.audit.log(user, 'APPROVE_MOBILE', 'Sale', sale.id, {
        approvedBy: user.id,
        approvedByName: user.name,
      });
    } catch {
      // Auditoria não deve bloquear o fluxo.
    }

    this.notifyStoreRealtime(sale.storeId, user.organizationId, 'sale_updated');

    if (pickup) {
      await this.notifyPortariaSale(user, sale);
    }

    return this.findOne(user, id);
  }

  async rejectMobile(user: AuthUser, id: string, input: unknown) {
    if (!canApproveMobileSales(user.role)) {
      throw new ForbiddenException('Sem permissão para rejeitar vendas do app.');
    }

    const data = rejectSaleMobileSchema.parse(input);
    const sale = await this.findOne(user, id);
    if (sale.mobileApproval !== 'PENDING') {
      throw new BadRequestException('Esta venda não está aguardando aprovação do app.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          mobileApproval: 'REJECTED',
          mobileRejectionReason: data.reason.trim(),
          status: SaleStatus.CANCELLED,
          canceledAt: now,
          canceledReason: `Venda do app rejeitada: ${data.reason.trim()}`,
        },
      });

      await tx.saleMobileApprovalLog.create({
        data: {
          saleId: sale.id,
          userId: user.id,
          action: 'REJECTED',
          notes: data.reason.trim(),
        },
      });

      await tx.saleStatusLog.create({
        data: {
          saleId: sale.id,
          status: SaleStatus.CANCELLED,
          userId: user.id,
          notes: `Venda do app rejeitada: ${data.reason.trim()}`,
        },
      });
    });

    try {
      await this.audit.log(user, 'REJECT_MOBILE', 'Sale', sale.id, {
        rejectedBy: user.id,
        rejectedByName: user.name,
        reason: data.reason.trim(),
      });
    } catch {
      // Auditoria não deve bloquear o fluxo.
    }

    this.notifyStoreRealtime(sale.storeId, user.organizationId, 'sale_updated');

    await this.notifyCancelledSale(
      user,
      sale,
      `Venda do app rejeitada: ${data.reason.trim()}`,
      sale.status,
    );

    return this.findOne(user, id);
  }

  private async validateMobileSaleReferences(user: AuthUser, data: CreateMobileSaleInput) {
    const store = await this.prisma.store.findFirst({
      where: { id: data.storeId, organizationId: user.organizationId },
    });
    if (!store) {
      throw new BadRequestException('Loja não encontrada.');
    }

    if (data.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: {
          id: data.customerId,
          organizationId: user.organizationId,
          storeId: data.storeId,
        },
      });
      if (!customer) {
        throw new BadRequestException('Cliente não encontrado nesta loja.');
      }
    }

    for (const item of data.items) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: item.productId,
          organizationId: user.organizationId,
          active: true,
        },
      });
      if (!product) {
        throw new BadRequestException('Produto não encontrado ou inativo.');
      }
    }
  }

  private async finalizeSaleFulfillment(
    tx: Prisma.TransactionClient | PrismaService,
    saleId: string,
    data: CreateSaleInput,
    userId: string,
    isPickup: boolean,
  ): Promise<{ id: string; delivererId: string | null } | null> {
    // Retirada (portaria) já é venda finalizada → baixa na criação.
    // Entrega: estoque só baixa quando a venda for marcada como DELIVERED.
    if (isPickup) {
      await this.stockService.deductSaleItems(
        tx,
        data.storeId,
        data.items,
        userId,
        saleId,
      );
      return null;
    }

    // Entrega: sempre cria Delivery. Sem entregador = pedido em espera (sidebar).
    const delivery = await tx.delivery.create({
      data: {
        saleId,
        delivererId: data.delivererId || null,
        status: DeliveryStatus.PENDING,
      },
      select: { id: true, delivererId: true },
    });

    if (data.delivererId) {
      // Garante unidade ativa = loja da rota (mapa por unidade).
      await tx.deliverer.update({
        where: { id: data.delivererId },
        data: { availableStoreId: data.storeId },
      });
    }

    return delivery;
  }

  async approveBackdate(user: AuthUser, id: string) {
    if (!canManageSales(user.role)) {
      throw new ForbiddenException('Apenas gerente ou master pode aprovar vendas retroativas.');
    }

    const sale = await this.findOne(user, id);
    if (sale.backdateApproval !== 'PENDING') {
      throw new BadRequestException('Esta venda não está aguardando aprovação de data.');
    }

    const pickup = sale.channel === 'IN_STORE';
    const saleInput = this.buildSaleInputFromExisting(sale, pickup);

    const now = new Date();

    const { pushDelivery } = await this.prisma.$transaction(async (tx) => {
      const newDelivery = await this.finalizeSaleFulfillment(tx, sale.id, saleInput, user.id, pickup);

      const nextStatus = pickup ? SaleStatus.PORTARIA : SaleStatus.CONFIRMED;
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          backdateApproval: 'APPROVED',
          backdateApprovedAt: now,
          backdateApprovedById: user.id,
          confirmedAt: now,
          deliveredAt: pickup ? now : undefined,
          status: nextStatus,
        },
      });

      await tx.saleBackdateLog.create({
        data: {
          saleId: sale.id,
          userId: user.id,
          action: 'APPROVED',
          notes: 'Venda retroativa aprovada',
        },
      });

      if (pickup && sale.status !== SaleStatus.PORTARIA) {
        await tx.saleStatusLog.create({
          data: {
            saleId: sale.id,
            status: SaleStatus.PORTARIA,
            userId: user.id,
            notes: 'Aprovada — retirada na portaria',
          },
        });
      }

      return { pushDelivery: newDelivery };
    });

    try {
      await this.audit.log(user, 'APPROVE_BACKDATE', 'Sale', sale.id, {
        saleDate: sale.saleDate,
        approvedBy: user.id,
        approvedByName: user.name,
      });
    } catch {
      // Auditoria não deve bloquear o fluxo.
    }

    if (pushDelivery?.delivererId) {
      void this.push
        .notifyNewDelivery(pushDelivery.delivererId, pushDelivery.id)
        .catch(() => undefined);
    }

    this.notifyStoreRealtime(sale.storeId, user.organizationId, 'sale_updated');

    if (pickup) {
      await this.notifyPortariaSale(user, sale);
    }

    return this.findOne(user, id);
  }

  async rejectBackdate(user: AuthUser, id: string, input: unknown) {
    if (!canManageSales(user.role)) {
      throw new ForbiddenException('Apenas gerente ou master pode rejeitar vendas retroativas.');
    }

    const data = rejectSaleBackdateSchema.parse(input);
    const sale = await this.findOne(user, id);
    if (sale.backdateApproval !== 'PENDING') {
      throw new BadRequestException('Esta venda não está aguardando aprovação de data.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          backdateApproval: 'REJECTED',
          backdateRejectionReason: data.reason.trim(),
          status: SaleStatus.CANCELLED,
          canceledAt: now,
          canceledReason: `Venda retroativa rejeitada: ${data.reason.trim()}`,
        },
      });

      await tx.saleBackdateLog.create({
        data: {
          saleId: sale.id,
          userId: user.id,
          action: 'REJECTED',
          notes: data.reason.trim(),
        },
      });

      await tx.saleStatusLog.create({
        data: {
          saleId: sale.id,
          status: SaleStatus.CANCELLED,
          userId: user.id,
          notes: `Venda retroativa rejeitada: ${data.reason.trim()}`,
        },
      });
    });

    try {
      await this.audit.log(user, 'REJECT_BACKDATE', 'Sale', sale.id, {
        saleDate: sale.saleDate,
        rejectedBy: user.id,
        rejectedByName: user.name,
        reason: data.reason.trim(),
      });
    } catch {
      // Auditoria não deve bloquear o fluxo.
    }

    this.notifyStoreRealtime(sale.storeId, user.organizationId, 'sale_updated');

    await this.notifyCancelledSale(
      user,
      sale,
      `Venda retroativa rejeitada: ${data.reason.trim()}`,
      sale.status,
    );

    return this.findOne(user, id);
  }

  private async rollbackSaleCreate(
    saleId: string,
    storeId: string,
    deducted: { productId: string; quantity: number }[],
    userId: string,
  ) {
    for (const item of deducted) {
      try {
        await this.stockService.restoreForCancelledSale(
          this.prisma,
          storeId,
          item.productId,
          item.quantity,
          userId,
          saleId,
        );
      } catch {
        // Melhor esforço ao reverter estoque.
      }
    }

    try {
      await this.prisma.sale.update({
        where: { id: saleId },
        data: {
          status: SaleStatus.CANCELLED,
          canceledAt: new Date(),
          canceledReason: 'Falha ao concluir a venda',
        },
      });
      await this.prisma.saleStatusLog.create({
        data: {
          saleId,
          status: SaleStatus.CANCELLED,
          userId,
          notes: 'Falha ao concluir a venda',
        },
      });
    } catch {
      // Venda parcial pode exigir revisão manual.
    }
  }

  private async resolveDeliveryFee(
    storeId: string,
    items: CreateSaleInput['items'],
  ): Promise<number> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    if (productIds.length === 0) return 0;

    const settings = await this.prisma.productStoreSetting.findMany({
      where: { storeId, productId: { in: productIds } },
    });

    return settings.reduce((sum, setting) => sum + toNumber(setting.deliveryFee), 0);
  }

  private async resolveItemUnitCosts(
    storeId: string,
    items: { productId: string }[],
  ): Promise<Map<string, number>> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    if (productIds.length === 0) return new Map();

    const settings = await this.prisma.productStoreSetting.findMany({
      where: { storeId, productId: { in: productIds } },
      select: { productId: true, supplierCost: true },
    });

    return new Map(settings.map((setting) => [setting.productId, toNumber(setting.supplierCost)]));
  }

  private buildSaleInputFromExisting(
    sale: {
      storeId: string;
      customerId: string | null;
      channel: string;
      delivererId: string | null;
      notes?: string | null;
      deliveryStreet?: string | null;
      deliveryNumber?: string | null;
      deliveryComplement?: string | null;
      deliveryNeighborhood?: string | null;
      deliveryCity?: string | null;
      deliveryState?: string | null;
      deliveryLandmark?: string | null;
      items: Array<{
        productId: string;
        quantity: number;
        unitPrice: unknown;
        discount: unknown;
      }>;
    },
    pickup: boolean,
  ): CreateSaleInput {
    return {
      storeId: sale.storeId,
      customerId: sale.customerId ?? undefined,
      channel: sale.channel as CreateSaleInput['channel'],
      fulfillmentType: pickup ? 'PICKUP' : 'DELIVERY',
      delivererId: sale.delivererId ?? undefined,
      notes: sale.notes ?? undefined,
      deliveryStreet: pickup ? undefined : sale.deliveryStreet ?? undefined,
      deliveryNumber: pickup ? undefined : sale.deliveryNumber ?? undefined,
      deliveryComplement: pickup ? undefined : sale.deliveryComplement ?? undefined,
      deliveryNeighborhood: pickup ? undefined : sale.deliveryNeighborhood ?? undefined,
      deliveryCity: pickup ? undefined : sale.deliveryCity ?? undefined,
      deliveryState: pickup ? undefined : sale.deliveryState ?? undefined,
      deliveryLandmark: pickup ? undefined : sale.deliveryLandmark ?? undefined,
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice),
        discount: toNumber(item.discount),
      })),
    };
  }

  private async validateSaleReferences(user: AuthUser, data: CreateSaleInput) {
    const attendant = await this.prisma.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId, active: true },
    });
    if (!attendant) {
      throw new BadRequestException('Sessão inválida. Faça login novamente.');
    }

    const store = await this.prisma.store.findFirst({
      where: { id: data.storeId, organizationId: user.organizationId },
    });
    if (!store) {
      throw new BadRequestException('Loja não encontrada.');
    }

    if (data.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: {
          id: data.customerId,
          organizationId: user.organizationId,
          storeId: data.storeId,
        },
      });
      if (!customer) {
        throw new BadRequestException('Cliente não encontrado nesta loja.');
      }
    }

    if (data.delivererId) {
      await this.assertDelivererAssignable(data.delivererId, data.storeId, user.organizationId);
    }

    if (data.fulfillmentType === 'DELIVERY' && data.customerId) {
      const hasAddress =
        data.deliveryStreet?.trim() ||
        data.deliveryCity?.trim();
      if (!hasAddress) {
        throw new BadRequestException('Informe o endereço de entrega.');
      }
    }

    for (const item of data.items) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: item.productId,
          organizationId: user.organizationId,
          active: true,
        },
        include: {
          storeSettings: { where: { storeId: data.storeId } },
          stockBalances: { where: { storeId: data.storeId } },
        },
      });

      if (!product) {
        throw new BadRequestException('Produto não encontrado ou inativo.');
      }

      const balance = product.stockBalances[0];
      if (!balance) {
        throw new BadRequestException(
          `Produto "${product.name}" sem estoque cadastrado nesta loja. Ajuste em Estoque.`,
        );
      }

      if (balance.available < item.quantity) {
        throw new BadRequestException(
          `Estoque insuficiente para "${product.name}" (disponível: ${balance.available}).`,
        );
      }
    }
  }

  private assertCanUpdateSaleStatus(
    user: AuthUser,
    currentStatus: SaleStatus,
    nextStatus: SaleStatus,
  ) {
    if (currentStatus === SaleStatus.CANCELLED) {
      throw new BadRequestException('Venda cancelada não pode ser alterada.');
    }

    const isTerminal =
      currentStatus === SaleStatus.DELIVERED || currentStatus === SaleStatus.PORTARIA;

    if (isTerminal) {
      if (!canManageSales(user.role)) {
        throw new BadRequestException('Apenas gerente ou master pode alterar esta venda.');
      }
      if (nextStatus !== SaleStatus.CANCELLED) {
        throw new BadRequestException('Vendas finalizadas só podem ser canceladas.');
      }
    }
  }

  async updateStatus(user: AuthUser, id: string, input: unknown) {
    const data = updateSaleStatusSchema.parse(input);
    const sale = await this.findOne(user, id);
    const nextStatus = data.status as SaleStatus;

    if (sale.backdateApproval === 'PENDING') {
      throw new BadRequestException(
        'Venda aguardando aprovação de data retroativa. Aguarde aprovação do gerente.',
      );
    }

    if (sale.backdateApproval === 'REJECTED') {
      throw new BadRequestException('Venda retroativa rejeitada não pode ser alterada.');
    }

    if (sale.mobileApproval === 'PENDING') {
      throw new BadRequestException(
        'Venda aguardando aprovação do app. Aguarde aprovação da loja.',
      );
    }

    if (sale.mobileApproval === 'REJECTED') {
      throw new BadRequestException('Venda do app rejeitada não pode ser alterada.');
    }

    this.assertCanUpdateSaleStatus(user, sale.status, nextStatus);

    if (nextStatus === SaleStatus.CANCELLED && !data.canceledReason?.trim()) {
      throw new BadRequestException('Informe o motivo do cancelamento.');
    }

    if (data.delivererId && nextStatus === SaleStatus.IN_DELIVERY) {
      await this.assertDelivererAssignable(data.delivererId, sale.storeId, user.organizationId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (data.status === 'CANCELLED') {
        const hadDeduction = await this.stockService.hasSaleStockDeduction(tx, sale.id);
        if (hadDeduction) {
          await Promise.all(
            sale.items.map((item) =>
              this.stockService.restoreForCancelledSale(
                tx,
                sale.storeId,
                item.productId,
                item.quantity,
                user.id,
                sale.id,
              ),
            ),
          );
        }
      }

      if (data.status === 'DELIVERED') {
        await this.stockService.deductSaleItems(
          tx,
          sale.storeId,
          sale.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          user.id,
          sale.id,
        );
      }

      await tx.sale.update({
        where: { id },
        data: {
          status: data.status as SaleStatus,
          delivererId: data.delivererId ?? sale.delivererId,
          canceledReason: data.canceledReason,
          canceledAt: data.status === 'CANCELLED' ? new Date() : undefined,
          deliveredAt: data.status === 'DELIVERED' ? new Date() : undefined,
        },
      });

      await tx.saleStatusLog.create({
        data: {
          saleId: id,
          status: nextStatus,
          userId: user.id,
          notes:
            nextStatus === SaleStatus.CANCELLED
              ? data.canceledReason?.trim()
              : undefined,
        },
      });

      let pushNewDelivery: { delivererId: string; deliveryId: string } | null = null;
      let pushCancelled: { delivererId: string; deliveryId: string } | null = null;

      if (data.status === 'IN_DELIVERY' && data.delivererId) {
        const previousDelivery = sale.delivery;
        const delivery = await tx.delivery.upsert({
          where: { saleId: id },
          update: {
            delivererId: data.delivererId,
            status: DeliveryStatus.PENDING,
            pendingReminderSentAt: null,
            startedAt: null,
            completedAt: null,
          },
          create: {
            saleId: id,
            delivererId: data.delivererId,
            status: DeliveryStatus.PENDING,
          },
          select: { id: true, delivererId: true },
        });

        // Pontos de GPS ficam no delivery — ao trocar entregador (ou reabrir rota),
        // limpar trilha para o novo entregador não herdar a localização do anterior.
        if (
          previousDelivery
          && (
            previousDelivery.delivererId !== data.delivererId
            || previousDelivery.status !== DeliveryStatus.PENDING
          )
        ) {
          await tx.deliveryTrackingPoint.deleteMany({
            where: { deliveryId: delivery.id },
          });
        }

        if (data.delivererId !== sale.delivererId || !sale.delivery) {
          pushNewDelivery = { delivererId: data.delivererId, deliveryId: delivery.id };
        }

        await tx.deliverer.update({
          where: { id: data.delivererId },
          data: { availableStoreId: sale.storeId },
        });
      }

      if (data.status === 'CANCELLED' && sale.delivery) {
        await tx.delivery.update({
          where: { saleId: id },
          data: { status: DeliveryStatus.CANCELLED },
        });
        if (
          sale.delivery.delivererId
          && (
            sale.delivery.status === DeliveryStatus.PENDING ||
            sale.delivery.status === DeliveryStatus.IN_PROGRESS
          )
        ) {
          pushCancelled = {
            delivererId: sale.delivery.delivererId,
            deliveryId: sale.delivery.id,
          };
        }
      }

      if (data.status === 'DELIVERED' && sale.delivery) {
        await tx.delivery.update({
          where: { saleId: id },
          data: { status: DeliveryStatus.DELIVERED, completedAt: new Date() },
        });
      }

      return { pushNewDelivery, pushCancelled };
    });

    try {
      await this.audit.log(user, 'UPDATE_STATUS', 'Sale', id, {
        status: data.status,
        previousStatus: sale.status,
        canceledReason: data.canceledReason ?? null,
        canceledBy: user.id,
        canceledByName: user.name,
      });
    } catch {
      // Auditoria não deve bloquear alteração de status já persistida.
    }

    if (result.pushNewDelivery) {
      void this.push
        .notifyNewDelivery(result.pushNewDelivery.delivererId, result.pushNewDelivery.deliveryId)
        .catch(() => undefined);
    }
    if (result.pushCancelled) {
      void this.push
        .notifyDeliveryCancelled(result.pushCancelled.delivererId, result.pushCancelled.deliveryId)
        .catch(() => undefined);
    }

    this.notifyStoreRealtime(sale.storeId, user.organizationId, 'sale_status');

    if (nextStatus === SaleStatus.CANCELLED) {
      await this.notifyCancelledSale(user, sale, data.canceledReason, sale.status);
    }

    return this.findOne(user, id);
  }

  async updatePayments(user: AuthUser, id: string, input: unknown) {
    const parsed = updateSalePaymentsSchema.parse(input);
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        store: { select: { organizationId: true } },
        payments: true,
        items: true,
        delivery: { include: { deliverer: { select: { userId: true } } } },
      },
    });

    if (!sale || sale.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Venda não encontrada');
    }

    assertStoreAccess(user, sale.storeId);

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('Não é possível alterar pagamentos de venda cancelada.');
    }

    const submittedUnitPrice = parsed.unitPrice;
    const submittedItemUnitPrices = parsed.itemUnitPrices;

    if (submittedUnitPrice !== undefined && submittedItemUnitPrices?.length) {
      throw new BadRequestException(
        'Envie unitPrice ou itemUnitPrices, não ambos.',
      );
    }

    if (submittedUnitPrice !== undefined && sale.items.length !== 1) {
      throw new BadRequestException(
        'Ajuste de preço unitário único só é suportado para vendas com um produto. Use itemUnitPrices.',
      );
    }

    if (submittedItemUnitPrices?.length) {
      for (const row of submittedItemUnitPrices) {
        if (!sale.items.some((item) => item.id === row.id)) {
          throw new BadRequestException('Item de venda inválido para atualizar preço.');
        }
      }
    }

    const unitPriceByItemId = new Map<string, number>();
    if (submittedItemUnitPrices?.length) {
      for (const row of submittedItemUnitPrices) {
        unitPriceByItemId.set(row.id, row.unitPrice);
      }
    } else if (submittedUnitPrice !== undefined && sale.items[0]) {
      unitPriceByItemId.set(sale.items[0].id, submittedUnitPrice);
    }

    const hasUnitPriceAdjustments = unitPriceByItemId.size > 0;

    let itemsForPlan = sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: unitPriceByItemId.get(item.id) ?? toNumber(item.unitPrice),
      discount: toNumber(item.discount),
      storePaymentMethodId: item.storePaymentMethodId,
    }));

    if (parsed.itemPayments?.length) {
      const byId = new Map(parsed.itemPayments.map((row) => [row.id, row.storePaymentMethodId]));
      for (const row of parsed.itemPayments) {
        if (!sale.items.some((item) => item.id === row.id)) {
          throw new BadRequestException('Item de venda inválido para atualizar pagamento.');
        }
      }
      itemsForPlan = itemsForPlan.map((row) => ({
        ...row,
        storePaymentMethodId: byId.get(row.id) ?? row.storePaymentMethodId,
      }));
    }

    const deliveryFee = toNumber(sale.deliveryFee);
    const saleTotal = hasUnitPriceAdjustments
      ? itemsForPlan.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice - (item.discount ?? 0),
          0,
        ) + deliveryFee
      : toNumber(sale.total);
    const {
      resolvedPayments,
      gasDoPovoBenefit,
      deliveryFeeStorePaymentMethodId,
    } = await this.resolveSalePaymentPlan(
      sale.storeId,
      itemsForPlan,
      deliveryFee,
      {
        payments: parsed.payments,
        gasDoPovoBenefit: parsed.itemPayments?.length
          ? undefined
          : parsed.payments?.some((p) => p.method === 'GDP')
            ? true
            : parsed.payments?.length
              ? false
              : sale.gasDoPovoBenefit,
        deliveryFeeStorePaymentMethodId:
          parsed.deliveryFeeStorePaymentMethodId !== undefined
            ? parsed.deliveryFeeStorePaymentMethodId
            : sale.deliveryFeeStorePaymentMethodId,
      },
    );

    try {
      assertSalePaymentsTotal(resolvedPayments, saleTotal);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Pagamentos inválidos.');
    }

    const isDelivererOwner =
      user.role === 'DELIVERER'
      && sale.delivery?.deliverer?.userId === user.id;

    if (hasUnitPriceAdjustments && !isDelivererOwner) {
      const isFinance = user.role === 'FINANCE';
      const isManager = canManageSales(user.role);
      const hasSalesScreen = hasScreenPermission(user.role, user.permissions, 'store.sales');
      const terminal = sale.status === SaleStatus.DELIVERED || sale.status === SaleStatus.PORTARIA;

      if (!isManager && !isFinance && !hasSalesScreen) {
        throw new ForbiddenException('Sem permissão para alterar o preço unitário desta venda.');
      }
      if (terminal && !isManager && !isFinance) {
        throw new ForbiddenException(
          'Apenas gerente ou financeiro podem alterar o preço de venda finalizada.',
        );
      }
    }

    if (isDelivererOwner) {
      if (sale.delivery?.status !== DeliveryStatus.IN_PROGRESS) {
        throw new ForbiddenException('Pagamentos só podem ser alterados durante a rota ativa.');
      }
    } else {
      const isFinance = user.role === 'FINANCE';
      const isManager = canManageSales(user.role);
      const hasSalesScreen = hasScreenPermission(user.role, user.permissions, 'store.sales');
      const terminal = sale.status === SaleStatus.DELIVERED || sale.status === SaleStatus.PORTARIA;

      if (!isManager && !isFinance && !hasSalesScreen) {
        throw new ForbiddenException('Sem permissão para alterar pagamentos desta venda.');
      }
      if (terminal && !isManager && !isFinance) {
        throw new ForbiddenException(
          'Apenas gerente ou financeiro podem alterar pagamentos de venda finalizada.',
        );
      }
    }

    const previousPayments = sale.payments.map((p) => ({
      method: p.method,
      amount: toNumber(p.amount),
      storePaymentMethodId: p.storePaymentMethodId,
      processingFee: toNumber(p.processingFee),
    }));

    await this.prisma.$transaction(async (tx) => {
      if (hasUnitPriceAdjustments) {
        for (const item of itemsForPlan) {
          if (!unitPriceByItemId.has(item.id)) continue;
          const itemTotal = item.quantity * item.unitPrice - (item.discount ?? 0);
          await tx.saleItem.update({
            where: { id: item.id },
            data: {
              unitPrice: item.unitPrice,
              total: itemTotal,
            },
          });
        }
      }

      if (parsed.itemPayments?.length) {
        for (const row of parsed.itemPayments) {
          await tx.saleItem.update({
            where: { id: row.id },
            data: { storePaymentMethodId: row.storePaymentMethodId },
          });
        }
      }

      await tx.sale.update({
        where: { id },
        data: {
          total: saleTotal,
          gasDoPovoBenefit,
          deliveryFeeStorePaymentMethodId: deliveryFeeStorePaymentMethodId,
        },
      });

      await tx.salePayment.deleteMany({ where: { saleId: id } });
      await tx.salePayment.createMany({
        data: resolvedPayments.map((p) => ({
          saleId: id,
          method: p.method,
          amount: p.amount,
          storePaymentMethodId: p.storePaymentMethodId,
          processingFee: p.processingFee,
        })),
      });
      await tx.saleStatusLog.create({
        data: {
          saleId: id,
          status: sale.status,
          userId: user.id,
          notes: 'Pagamentos atualizados',
        },
      });
    });

    try {
      await this.audit.log(user, 'UPDATE_PAYMENTS', 'Sale', id, {
        storeId: sale.storeId,
        previousPayments,
        newPayments: resolvedPayments.map((p) => ({
          method: p.method,
          amount: p.amount,
          storePaymentMethodId: p.storePaymentMethodId,
          processingFee: p.processingFee,
        })),
        total: saleTotal,
      });
    } catch {
      // auditoria não bloqueia
    }

    this.notifyStoreRealtime(sale.storeId, sale.store.organizationId, 'sale_payments');

    return this.findOne(user, id);
  }

  private async assertDelivererAssignable(
    delivererId: string,
    storeId: string,
    organizationId: string,
  ) {
    const deliverer = await this.prisma.deliverer.findFirst({
      where: {
        id: delivererId,
        stores: {
          some: { storeId, store: { organizationId } },
        },
      },
      include: {
        user: { select: { active: true } },
      },
    });
    if (!deliverer) {
      throw new BadRequestException('Entregador não atende esta unidade.');
    }

    const { assignable, reason } = isDelivererAssignableForSale(
      {
        status: deliverer.status,
        user: deliverer.user,
        availableStoreId: deliverer.availableStoreId,
      },
      storeId,
    );
    if (!assignable) {
      throw new BadRequestException(
        reason ? `Entregador indisponível: ${reason}.` : 'Entregador indisponível.',
      );
    }
  }

  /**
   * Resolve pagamentos da venda: por produto (agregado) ou linhas livres / atalho GDP 100%.
   * `gasDoPovoBenefit` final = há pelo menos um pagamento GDP.
   */
  private async resolveSalePaymentPlan(
    storeId: string,
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discount?: number | null;
      storePaymentMethodId?: string | null;
    }>,
    deliveryFee: number,
    options: {
      payments?: Array<{ method?: string; storePaymentMethodId?: string; amount: number }>;
      gasDoPovoBenefit?: boolean;
      deliveryFeeStorePaymentMethodId?: string | null;
    },
  ) {
    const itemsTotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice - (item.discount ?? 0),
      0,
    );
    const total = itemsTotal + deliveryFee;

    if (anyItemHasPaymentMethod(items) && !allItemsHavePaymentMethod(items)) {
      throw new BadRequestException('Defina a forma de pagamento em todos os produtos.');
    }

    const fromItems = buildPaymentAllocationsFromItems(
      items,
      deliveryFee,
      options.deliveryFeeStorePaymentMethodId,
    );

    let payments: Array<{ method?: string; storePaymentMethodId?: string; amount: number }>;
    let deliveryFeeStorePaymentMethodId =
      options.deliveryFeeStorePaymentMethodId?.trim() || null;

    if (fromItems.length > 0) {
      payments = fromItems;
      if (deliveryFee > 0.009 && !deliveryFeeStorePaymentMethodId) {
        deliveryFeeStorePaymentMethodId =
          items.find((item) => item.storePaymentMethodId)?.storePaymentMethodId ?? null;
      }
    } else if (options.gasDoPovoBenefit && !(options.payments?.length)) {
      // Atalho legado: benefício GDP sem linhas → 100% GDP.
      payments = [{ method: 'GDP', amount: total }];
    } else {
      payments = options.payments?.length
        ? options.payments
        : [{ method: 'CASH', amount: total }];
    }

    const gdpMethod = await this.prisma.storePaymentMethod.findFirst({
      where: { storeId, systemCode: 'GDP' },
      select: { id: true },
    });

    const allowGdp =
      Boolean(options.gasDoPovoBenefit)
      || payments.some(
        (p) =>
          p.method === 'GDP'
          || (gdpMethod != null && p.storePaymentMethodId === gdpMethod.id),
      )
      || items.some((item) => gdpMethod != null && item.storePaymentMethodId === gdpMethod.id);

    const resolvedPayments = await this.paymentMethods.resolvePaymentsForSale(
      storeId,
      payments as Array<{ method?: import('@gas-erp/database').PaymentMethod; storePaymentMethodId?: string; amount: number }>,
      { allowGdp },
    );

    const gasDoPovoBenefit = resolvedPayments.some((p) => p.method === 'GDP');

    return {
      resolvedPayments,
      gasDoPovoBenefit,
      deliveryFeeStorePaymentMethodId,
    };
  }
}
