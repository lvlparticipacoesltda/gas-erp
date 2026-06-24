import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { deliveryTrackingSchema, updateDeliveryStatusSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService) {}

  async findByStore(user: AuthUser, storeId: string) {
    return this.prisma.delivery.findMany({
      where: {
        sale: { storeId },
        status: { in: [DeliveryStatus.PENDING, DeliveryStatus.IN_PROGRESS] },
      },
      include: {
        sale: { include: { customer: true, items: { include: { product: true } } } },
        deliverer: { include: { user: { select: { id: true, name: true } } } },
        trackingPoints: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
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
      include: { deliverer: true },
    });
    if (!delivery) throw new NotFoundException('Entrega não encontrada');
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
      include: { deliverer: true, sale: true },
    });
    if (!delivery) throw new NotFoundException('Entrega não encontrada');
    if (delivery.deliverer.userId !== user.id && user.role !== 'ORG_MASTER') {
      throw new ForbiddenException('Sem permissão');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: status as DeliveryStatus,
          startedAt: status === 'IN_PROGRESS' ? new Date() : delivery.startedAt,
          completedAt: status === 'DELIVERED' ? new Date() : undefined,
        },
        include: { sale: true },
      });

      if (status === 'DELIVERED') {
        await tx.sale.update({
          where: { id: delivery.saleId },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
        await tx.deliverer.update({
          where: { id: delivery.delivererId },
          data: { status: 'AVAILABLE' },
        });
      } else if (status === 'IN_PROGRESS') {
        await tx.deliverer.update({
          where: { id: delivery.delivererId },
          data: { status: 'ON_DELIVERY' },
        });
      }

      return updated;
    });
  }
}
