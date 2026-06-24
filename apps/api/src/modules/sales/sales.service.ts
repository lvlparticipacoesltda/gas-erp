import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryStatus, SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { createSaleSchema, updateSaleStatusSchema, type CreateSaleInput } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { StockService } from '../stock/stock.service';
import { AuditService } from '../../common/audit/audit.service';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
  ) {}

  private saleInclude = {
    customer: true,
    attendant: { select: { id: true, name: true } },
    deliverer: { include: { user: { select: { id: true, name: true } } } },
    items: { include: { product: true } },
    payments: true,
    delivery: true,
    statusLogs: { orderBy: { createdAt: 'asc' as const } },
  };

  async findAll(
    user: AuthUser,
    storeId: string,
    status?: string,
    page = 1,
    pageSize = 20,
  ) {
    assertStoreAccess(user, storeId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = {
      storeId,
      ...(status ? { status: status as SaleStatus } : {}),
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

    const total = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice - (item.discount ?? 0),
      0,
    );

    const payments = data.payments?.length
      ? data.payments
      : [{ method: 'CASH' as const, amount: total }];

    const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (total > 0 && paidTotal <= 0) {
      throw new BadRequestException(
        'Informe o valor do pagamento. Verifique o preço unitário do produto.',
      );
    }

    await this.validateSaleReferences(user, data);

    const created = await this.prisma.sale.create({
      data: {
        storeId: data.storeId,
        customerId: data.customerId,
        attendantId: user.id,
        delivererId: data.delivererId,
        channel: data.channel ?? 'PHONE',
        status: SaleStatus.CONFIRMED,
        total,
        notes: data.notes,
        deliveryStreet: data.deliveryStreet || undefined,
        deliveryNumber: data.deliveryNumber || undefined,
        deliveryComplement: data.deliveryComplement || undefined,
        deliveryNeighborhood: data.deliveryNeighborhood || undefined,
        deliveryCity: data.deliveryCity || undefined,
        deliveryState: data.deliveryState || undefined,
        deliveryLandmark: data.deliveryLandmark || undefined,
        confirmedAt: new Date(),
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount ?? 0,
            total: item.quantity * item.unitPrice - (item.discount ?? 0),
          })),
        },
        payments: { create: payments },
        statusLogs: { create: { status: SaleStatus.CONFIRMED, userId: user.id } },
      },
      select: { id: true },
    });

    const deducted: { productId: string; quantity: number }[] = [];

    try {
      for (const item of data.items) {
        await this.stockService.deductForSale(
          this.prisma,
          data.storeId,
          item.productId,
          item.quantity,
          user.id,
          created.id,
        );
        deducted.push({ productId: item.productId, quantity: item.quantity });
      }

      if (data.delivererId) {
        await this.prisma.sale.update({
          where: { id: created.id },
          data: { status: SaleStatus.IN_DELIVERY },
        });
        await this.prisma.delivery.create({
          data: {
            saleId: created.id,
            delivererId: data.delivererId,
            status: DeliveryStatus.PENDING,
          },
        });
        await this.prisma.saleStatusLog.create({
          data: { saleId: created.id, status: SaleStatus.IN_DELIVERY, userId: user.id },
        });
      }
    } catch (error) {
      await this.rollbackSaleCreate(created.id, data.storeId, deducted, user.id);
      throw error;
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: created.id },
      include: this.saleInclude,
    });

    if (!sale) {
      throw new BadRequestException('Não foi possível registrar a venda.');
    }

    try {
      await this.audit.log(user, 'CREATE', 'Sale', sale.id);
    } catch {
      // Venda já foi salva; falha de auditoria não deve bloquear o fluxo.
    }

    return sale;
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
    } catch {
      // Venda parcial pode exigir revisão manual.
    }
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
        },
      });
      if (!customer) {
        throw new BadRequestException('Cliente não encontrado.');
      }
    }

    if (data.delivererId) {
      const deliverer = await this.prisma.deliverer.findFirst({
        where: {
          id: data.delivererId,
          storeId: data.storeId,
          store: { organizationId: user.organizationId },
        },
      });
      if (!deliverer) {
        throw new BadRequestException('Entregador não encontrado nesta loja.');
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

  async updateStatus(user: AuthUser, id: string, input: unknown) {
    const data = updateSaleStatusSchema.parse(input);
    const sale = await this.findOne(user, id);

    if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.DELIVERED) {
      throw new BadRequestException('Venda não pode ser alterada');
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.status === 'CANCELLED') {
        for (const item of sale.items) {
          await this.stockService.restoreForCancelledSale(
            tx,
            sale.storeId,
            item.productId,
            item.quantity,
            user.id,
            sale.id,
          );
        }
      }

      const updated = await tx.sale.update({
        where: { id },
        data: {
          status: data.status as SaleStatus,
          delivererId: data.delivererId ?? sale.delivererId,
          canceledReason: data.canceledReason,
          canceledAt: data.status === 'CANCELLED' ? new Date() : undefined,
          deliveredAt: data.status === 'DELIVERED' ? new Date() : undefined,
        },
        include: this.saleInclude,
      });

      await tx.saleStatusLog.create({
        data: { saleId: id, status: data.status as SaleStatus, userId: user.id },
      });

      if (data.status === 'IN_DELIVERY' && data.delivererId) {
        await tx.delivery.upsert({
          where: { saleId: id },
          update: { delivererId: data.delivererId, status: DeliveryStatus.PENDING },
          create: {
            saleId: id,
            delivererId: data.delivererId,
            status: DeliveryStatus.PENDING,
          },
        });
      }

      if (data.status === 'DELIVERED' && sale.delivery) {
        await tx.delivery.update({
          where: { saleId: id },
          data: { status: DeliveryStatus.DELIVERED, completedAt: new Date() },
        });
      }

      await this.audit.log(user, 'UPDATE_STATUS', 'Sale', id, { status: data.status });
      return updated;
    });
  }
}
