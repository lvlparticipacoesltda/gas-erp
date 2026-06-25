import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryStatus, SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { deliveryTrackingSchema, updateDeliveryStatusSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';

const STORE_STAFF_ROLES = new Set(['ORG_MASTER', 'STORE_MANAGER', 'ATTENDANT', 'FINANCE']);

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService) {}

  async findByStore(user: AuthUser, storeId: string) {
    assertStoreAccess(user, storeId);

    return this.prisma.delivery.findMany({
      where: {
        sale: { storeId, status: { in: [SaleStatus.CONFIRMED, SaleStatus.IN_DELIVERY] } },
        status: { in: [DeliveryStatus.PENDING, DeliveryStatus.IN_PROGRESS] },
      },
      include: {
        sale: {
          include: {
            customer: true,
            items: { include: { product: true } },
            payments: true,
          },
        },
        deliverer: { include: { user: { select: { id: true, name: true } } } },
        trackingPoints: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findByDeliverer(user: AuthUser) {
    const deliverer = await this.prisma.deliverer.findUnique({ where: { userId: user.id } });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');

    return this.prisma.delivery.findMany({
      where: { delivererId: deliverer.id, status: { not: DeliveryStatus.CANCELLED } },
      include: {
        sale: { include: { customer: true, items: { include: { product: true } }, payments: true } },
        trackingPoints: { orderBy: { recordedAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addTrackingPoint(user: AuthUser, deliveryId: string, input: unknown) {
    const data = deliveryTrackingSchema.parse(input);
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliverer: true, sale: { include: { store: true } } },
    });
    if (!delivery || delivery.sale.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Entrega não encontrada');
    }
    if (delivery.deliverer.userId !== user.id && user.role !== 'ORG_MASTER') {
      throw new ForbiddenException('Sem permissão');
    }

    return this.prisma.deliveryTrackingPoint.create({
      data: {
        deliveryId,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
      },
    });
  }

  async getTrackingHistory(user: AuthUser, deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliverer: true, sale: { include: { store: true } } },
    });
    if (!delivery || delivery.sale.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Entrega não encontrada');
    }

    return this.prisma.deliveryTrackingPoint.findMany({
      where: { deliveryId },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async updateStatus(user: AuthUser, deliveryId: string, input: unknown) {
    const { status } = updateDeliveryStatusSchema.parse(input);
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliverer: true, sale: { include: { store: true } } },
    });
    if (!delivery || delivery.sale.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Entrega não encontrada');
    }

    assertStoreAccess(user, delivery.sale.storeId);

    const isDeliverer = delivery.deliverer.userId === user.id;
    const isStoreStaff = STORE_STAFF_ROLES.has(user.role);
    if (!isDeliverer && !isStoreStaff) {
      throw new ForbiddenException('Sem permissão');
    }

    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: status as DeliveryStatus,
        startedAt: status === 'IN_PROGRESS' ? new Date() : delivery.startedAt,
        completedAt: status === 'DELIVERED' ? new Date() : undefined,
      },
      include: {
        sale: { include: { customer: true } },
        deliverer: { include: { user: { select: { name: true } } } },
      },
    });

    if (status === 'DELIVERED') {
      await this.prisma.sale.update({
        where: { id: delivery.saleId },
        data: { status: SaleStatus.DELIVERED, deliveredAt: new Date() },
      });
      await this.prisma.saleStatusLog.create({
        data: {
          saleId: delivery.saleId,
          status: SaleStatus.DELIVERED,
          userId: user.id,
        },
      });
      await this.prisma.deliverer.update({
        where: { id: delivery.delivererId },
        data: { status: 'AVAILABLE' },
      });
    } else if (status === 'IN_PROGRESS') {
      await this.prisma.sale.update({
        where: { id: delivery.saleId },
        data: { status: SaleStatus.IN_DELIVERY },
      });
      await this.prisma.deliverer.update({
        where: { id: delivery.delivererId },
        data: { status: 'ON_DELIVERY' },
      });
    }

    return updated;
  }
}
