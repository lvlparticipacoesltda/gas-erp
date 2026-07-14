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

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
    private push: PushService,
    private paymentMethods: StorePaymentMethodsService,
    private realtime: StoreRealtimeService,
  ) {}

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

  private saleInclude = {
    store: { select: { id: true, name: true, code: true } },
    customer: true,
    attendant: { select: { id: true, name: true } },
    deliverer: { include: { user: { select: { id: true, name: true } } } },
    backdateApprovedBy: { select: { id: true, name: true } },
    mobileApprovedBy: { select: { id: true, name: true } },
    createdByDeliverer: { include: { user: { select: { id: true, name: true } } } },
    items: { include: { product: true } },
    payments: true,
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

    const gasDoPovoBenefit = data.gasDoPovoBenefit ?? false;

    let payments = data.payments?.length
      ? data.payments
      : [{ method: 'CASH' as const, amount: total }];

    if (gasDoPovoBenefit) {
      payments = [{ method: 'GDP' as const, amount: total }];
    } else if (payments.some((p) => p.method === 'GDP')) {
      throw new BadRequestException(
        'Forma de pagamento GDP só é permitida com benefício Gás do Povo.',
      );
    }

    const resolvedPayments = await this.paymentMethods.resolvePaymentsForSale(
      data.storeId,
      payments,
      gasDoPovoBenefit,
    );

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

    let newDelivery: { id: string; delivererId: string } | null = null;

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

    if (newDelivery) {
      void this.push
        .notifyNewDelivery(newDelivery.delivererId, newDelivery.id)
        .catch(() => undefined);
    }

    this.notifyStoreRealtime(data.storeId, user.organizationId, 'sale_created');

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

    const gasDoPovoBenefit = data.gasDoPovoBenefit ?? false;

    let payments = data.payments?.length
      ? data.payments
      : [{ method: 'CASH' as const, amount: total }];

    if (gasDoPovoBenefit) {
      payments = [{ method: 'GDP' as const, amount: total }];
    } else if (payments.some((p) => p.method === 'GDP')) {
      throw new BadRequestException(
        'Forma de pagamento GDP só é permitida com benefício Gás do Povo.',
      );
    }

    const resolvedPayments = await this.paymentMethods.resolvePaymentsForSale(
      data.storeId,
      payments,
      gasDoPovoBenefit,
    );

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
    const saleInput: CreateSaleInput = {
      storeId: sale.storeId,
      customerId: sale.customerId ?? undefined,
      channel: sale.channel as CreateSaleInput['channel'],
      fulfillmentType: pickup ? 'PICKUP' : 'DELIVERY',
      delivererId: sale.delivererId ?? undefined,
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice),
        discount: toNumber(item.discount),
      })),
    };

    await this.validateSaleReferences(user, saleInput);

    const now = new Date();

    const { pushDelivery } = await this.prisma.$transaction(async (tx) => {
      const newDelivery = await this.finalizeSaleFulfillment(tx, sale.id, saleInput, user.id, pickup);

      const nextStatus = pickup ? SaleStatus.PORTARIA : SaleStatus.CONFIRMED;
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          mobileApproval: 'APPROVED',
          mobileApprovedAt: now,
          mobileApprovedById: user.id,
          attendantId: user.id,
          confirmedAt: now,
          deliveredAt: pickup ? now : undefined,
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
      } else if (!pickup && sale.status !== SaleStatus.CONFIRMED) {
        await tx.saleStatusLog.create({
          data: {
            saleId: sale.id,
            status: SaleStatus.CONFIRMED,
            userId: user.id,
            notes: 'Venda do app aprovada',
          },
        });
      }

      return { pushDelivery: newDelivery };
    });

    try {
      await this.audit.log(user, 'APPROVE_MOBILE', 'Sale', sale.id, {
        approvedBy: user.id,
        approvedByName: user.name,
      });
    } catch {
      // Auditoria não deve bloquear o fluxo.
    }

    if (pushDelivery) {
      void this.push
        .notifyNewDelivery(pushDelivery.delivererId, pushDelivery.id)
        .catch(() => undefined);
    }

    this.notifyStoreRealtime(sale.storeId, user.organizationId, 'sale_updated');

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
  ): Promise<{ id: string; delivererId: string } | null> {
    for (const item of data.items) {
      await this.stockService.deductForSale(
        tx,
        data.storeId,
        item.productId,
        item.quantity,
        userId,
        saleId,
      );
    }

    if (!isPickup && data.delivererId) {
      return tx.delivery.create({
        data: {
          saleId,
          delivererId: data.delivererId,
          status: DeliveryStatus.PENDING,
        },
        select: { id: true, delivererId: true },
      });
    }

    return null;
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

    const saleInput: CreateSaleInput = {
      storeId: sale.storeId,
      customerId: sale.customerId ?? undefined,
      channel: sale.channel as CreateSaleInput['channel'],
      fulfillmentType: pickup ? 'PICKUP' : 'DELIVERY',
      delivererId: sale.delivererId ?? undefined,
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice),
        discount: toNumber(item.discount),
      })),
    };

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

    if (pushDelivery) {
      void this.push
        .notifyNewDelivery(pushDelivery.delivererId, pushDelivery.id)
        .catch(() => undefined);
    }

    this.notifyStoreRealtime(sale.storeId, user.organizationId, 'sale_updated');

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
          pushNewDelivery = { delivererId: delivery.delivererId, deliveryId: delivery.id };
        }
      }

      if (data.status === 'CANCELLED' && sale.delivery) {
        await tx.delivery.update({
          where: { saleId: id },
          data: { status: DeliveryStatus.CANCELLED },
        });
        if (
          sale.delivery.status === DeliveryStatus.PENDING ||
          sale.delivery.status === DeliveryStatus.IN_PROGRESS
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

    return this.findOne(user, id);
  }

  async updatePayments(user: AuthUser, id: string, input: unknown) {
    const { payments, unitPrice: submittedUnitPrice } = updateSalePaymentsSchema.parse(input);
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

    const gasDoPovoBenefit = sale.gasDoPovoBenefit;

    if (submittedUnitPrice !== undefined && sale.items.length !== 1) {
      throw new BadRequestException(
        'Ajuste de preço unitário só é suportado para vendas com um produto.',
      );
    }

    let saleTotal = toNumber(sale.total);

    if (submittedUnitPrice !== undefined) {
      const deliveryFee = toNumber(sale.deliveryFee);
      const item = sale.items[0];
      const discount = toNumber(item.discount);
      const itemTotal = item.quantity * submittedUnitPrice - discount;
      saleTotal = itemTotal + deliveryFee;
    }

    try {
      assertSalePaymentsTotal(payments, saleTotal);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Pagamentos inválidos.');
    }

    const isDelivererOwner =
      user.role === 'DELIVERER'
      && sale.delivery?.deliverer.userId === user.id;

    if (submittedUnitPrice !== undefined && !isDelivererOwner) {
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

    if (gasDoPovoBenefit) {
      if (payments.length !== 1 || payments.some((p) => p.method && p.method !== 'GDP')) {
        throw new BadRequestException('Com benefício Gás do Povo, o pagamento deve ser 100% GDP.');
      }
    } else if (payments.some((p) => p.method === 'GDP')) {
      throw new BadRequestException('GDP só é permitido com benefício Gás do Povo.');
    }

    const resolvedPayments = await this.paymentMethods.resolvePaymentsForSale(
      sale.storeId,
      payments,
      gasDoPovoBenefit,
    );

    const previousPayments = sale.payments.map((p) => ({
      method: p.method,
      amount: toNumber(p.amount),
      storePaymentMethodId: p.storePaymentMethodId,
      processingFee: toNumber(p.processingFee),
    }));

    await this.prisma.$transaction(async (tx) => {
      if (submittedUnitPrice !== undefined) {
        const item = sale.items[0];
        const discount = toNumber(item.discount);
        const itemTotal = item.quantity * submittedUnitPrice - discount;
        await tx.saleItem.update({
          where: { id: item.id },
          data: {
            unitPrice: submittedUnitPrice,
            total: itemTotal,
          },
        });
        await tx.sale.update({
          where: { id },
          data: { total: saleTotal },
        });
      }

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

    const { assignable, reason } = isDelivererAssignableForSale({
      status: deliverer.status,
      user: deliverer.user,
    });
    if (!assignable) {
      throw new BadRequestException(
        reason ? `Entregador indisponível: ${reason}.` : 'Entregador indisponível.',
      );
    }
  }
}
