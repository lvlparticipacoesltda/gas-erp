import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeliveryStatus, SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  deliveryRouteQuerySchema,
  deliveryTrackingSchema,
  updateDeliveryStatusSchema,
} from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { getDeliveryPhaseMetrics } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { GeocodingService } from '../../common/geocoding/geocoding.service';
import { RoutingService } from '../../common/routing/routing.service';
import { StoreRealtimeService } from '../../common/realtime/store-realtime.service';
import { StockService } from '../stock/stock.service';

const STORE_STAFF_ROLES = new Set(['ORG_MASTER', 'STORE_MANAGER', 'ATTENDANT', 'FINANCE']);

type DeliveryWithSale = {
  status: DeliveryStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  sale: {
    createdAt: Date;
    deliveryStreet: string | null;
    deliveryNumber: string | null;
    deliveryComplement: string | null;
    deliveryNeighborhood: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    deliveryLandmark: string | null;
  };
};

function buildDeliveryAddress(sale: {
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryComplement?: string | null;
  deliveryNeighborhood: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryLandmark?: string | null;
}): string | null {
  const parts: string[] = [];
  const streetLine = [sale.deliveryStreet, sale.deliveryNumber].filter(Boolean).join(', ');
  if (streetLine) parts.push(streetLine);
  if (sale.deliveryComplement) parts.push(sale.deliveryComplement);
  if (sale.deliveryNeighborhood) parts.push(sale.deliveryNeighborhood);
  const cityLine = [sale.deliveryCity, sale.deliveryState].filter(Boolean).join(' - ');
  if (cityLine) parts.push(cityLine);
  if (sale.deliveryLandmark) parts.push(`Ref.: ${sale.deliveryLandmark}`);
  return parts.length ? parts.join(', ') : null;
}

/** Endereço limpo para Directions/geocode — sem complemento/ponto de referência. */
function buildRoutingAddress(sale: {
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryNeighborhood: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
}): string | null {
  const street = sale.deliveryStreet?.trim();
  const city = sale.deliveryCity?.trim();
  const state = sale.deliveryState?.trim();
  if (!street || !city) return null;

  const parts: string[] = [];
  const number = sale.deliveryNumber?.trim();
  parts.push(number ? `${street}, ${number}` : street);
  if (sale.deliveryNeighborhood?.trim()) parts.push(sale.deliveryNeighborhood.trim());
  parts.push(state ? `${city} - ${state}` : city);
  parts.push('Brasil');
  return parts.join(', ');
}

function withDeliveryMetrics<T extends DeliveryWithSale>(delivery: T, now: Date) {
  const metrics = getDeliveryPhaseMetrics({
    saleCreatedAt: delivery.sale.createdAt,
    deliveryStartedAt: delivery.startedAt,
    deliveryCompletedAt: delivery.completedAt,
    now,
  });
  return {
    ...delivery,
    deliveryAddress: buildDeliveryAddress(delivery.sale),
    destination: null as { latitude: number; longitude: number } | null,
    ...metrics,
  };
}

async function resolveDestination(
  geocoding: GeocodingService,
  sale: {
    deliveryStreet: string | null;
    deliveryNumber: string | null;
    deliveryNeighborhood: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
  },
): Promise<{ latitude: number; longitude: number } | null> {
  if (!sale.deliveryStreet?.trim() || !sale.deliveryCity?.trim() || !sale.deliveryState?.trim()) {
    return null;
  }
  const result = await geocoding.geocodeAddress({
    street: sale.deliveryStreet,
    number: sale.deliveryNumber ?? undefined,
    neighborhood: sale.deliveryNeighborhood ?? undefined,
    city: sale.deliveryCity,
    state: sale.deliveryState,
  });
  if (!result) return null;
  return { latitude: result.latitude, longitude: result.longitude };
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private prisma: PrismaService,
    private geocoding: GeocodingService,
    private routing: RoutingService,
    private realtime: StoreRealtimeService,
    private stock: StockService,
  ) {}

  async findByStore(user: AuthUser, storeId: string) {
    assertStoreAccess(user, storeId);

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        sale: { storeId, status: { in: [SaleStatus.CONFIRMED, SaleStatus.IN_DELIVERY] } },
        status: { in: [DeliveryStatus.PENDING, DeliveryStatus.IN_PROGRESS] },
      },
      include: {
        sale: {
          include: {
            customer: true,
            items: {
              include: {
                product: true,
                storePaymentMethod: { select: { id: true, label: true, systemCode: true } },
              },
            },
            payments: true,
          },
        },
        deliverer: { include: { user: { select: { id: true, name: true } } } },
        trackingPoints: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    return deliveries.map((delivery) => withDeliveryMetrics(delivery, now));
  }

  async findByDeliverer(user: AuthUser) {
    const deliverer = await this.prisma.deliverer.findUnique({ where: { userId: user.id } });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');

    const deliveries = await this.prisma.delivery.findMany({
      where: { delivererId: deliverer.id },
      include: {
        sale: {
          include: {
            customer: true,
            items: {
              include: {
                product: true,
                storePaymentMethod: { select: { id: true, label: true, systemCode: true } },
              },
            },
            payments: true,
          },
        },
        trackingPoints: { orderBy: { recordedAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const enriched = await Promise.all(
      deliveries.map(async (delivery) => {
        const base = withDeliveryMetrics(delivery, now);
        const destination = await resolveDestination(this.geocoding, delivery.sale);
        return { ...base, destination };
      }),
    );
    return enriched;
  }

  async getRouteForDelivery(
    user: AuthUser,
    deliveryId: string,
    query: unknown,
  ) {
    const { originLat, originLng } = deliveryRouteQuerySchema.parse(query);
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        deliverer: true,
        sale: {
          select: {
            storeId: true,
            deliveryStreet: true,
            deliveryNumber: true,
            deliveryComplement: true,
            deliveryNeighborhood: true,
            deliveryCity: true,
            deliveryState: true,
            deliveryLandmark: true,
            store: { select: { organizationId: true } },
          },
        },
      },
    });
    if (!delivery || delivery.sale.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Entrega não encontrada');
    }
    if (delivery.deliverer.userId !== user.id && user.role !== 'ORG_MASTER') {
      throw new ForbiddenException('Sem permissão');
    }

    const destination = await resolveDestination(this.geocoding, delivery.sale);
    const destAddress = buildRoutingAddress(delivery.sale);

    this.logger.log(
      `GET route delivery=${deliveryId} origin=(${originLat},${originLng}) ` +
        `geocoded=${destination ? `(${destination.latitude},${destination.longitude})` : 'null'} ` +
        `address="${destAddress ?? '—'}"`,
    );

    if (!destination && !destAddress) {
      throw new NotFoundException(
        'Endereço incompleto (rua, cidade e UF). Corrija a venda antes de traçar a rota.',
      );
    }

    return this.routing.getRoute({
      originLat,
      originLng,
      destLat: destination?.latitude,
      destLng: destination?.longitude,
      destAddress,
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

    const recordedAt = data.recordedAt ? new Date(data.recordedAt) : new Date();
    const presenceData = {
      lastLatitude: data.latitude,
      lastLongitude: data.longitude,
      lastAccuracy: data.accuracy,
      lastSeenAt: recordedAt,
      ...(data.batteryLevel !== undefined ? { batteryLevel: data.batteryLevel } : {}),
      ...(data.batteryCharging !== undefined ? { batteryCharging: data.batteryCharging } : {}),
    };

    const [point] = await this.prisma.$transaction([
      this.prisma.deliveryTrackingPoint.create({
        data: {
          deliveryId,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          recordedAt,
        },
      }),
      this.prisma.deliverer.update({
        where: { id: delivery.delivererId },
        data: presenceData,
      }),
    ]);

    return point;
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
      include: {
        deliverer: true,
        sale: {
          include: {
            store: true,
            items: true,
          },
        },
      },
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

    // Apenas o entregador dono pode iniciar a rota (IN_PROGRESS).
    if (status === 'IN_PROGRESS' && !(user.role === 'DELIVERER' && isDeliverer)) {
      throw new ForbiddenException('Apenas o entregador responsável pode iniciar a rota');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (status === 'DELIVERED') {
        await this.stock.deductSaleItems(
          tx,
          delivery.sale.storeId,
          delivery.sale.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          user.id,
          delivery.saleId,
        );
      }

      const next = await tx.delivery.update({
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
        await tx.sale.update({
          where: { id: delivery.saleId },
          data: { status: SaleStatus.DELIVERED, deliveredAt: new Date() },
        });
        await tx.saleStatusLog.create({
          data: {
            saleId: delivery.saleId,
            status: SaleStatus.DELIVERED,
            userId: user.id,
          },
        });
        await tx.deliverer.update({
          where: { id: delivery.delivererId },
          data: { status: 'AVAILABLE', availableStoreId: delivery.sale.storeId },
        });
      } else if (status === 'IN_PROGRESS') {
        await tx.sale.update({
          where: { id: delivery.saleId },
          data: { status: SaleStatus.IN_DELIVERY },
        });
        await tx.saleStatusLog.create({
          data: {
            saleId: delivery.saleId,
            status: SaleStatus.IN_DELIVERY,
            userId: user.id,
            notes: 'Entregador iniciou a rota',
          },
        });
        await tx.deliverer.update({
          where: { id: delivery.delivererId },
          data: { status: 'ON_DELIVERY', availableStoreId: delivery.sale.storeId },
        });
      }

      return next;
    });

    try {
      this.realtime.notifyStoreChange(
        delivery.sale.storeId,
        delivery.sale.store.organizationId,
        'delivery_updated',
      );
    } catch {
      // Eventos em tempo real não devem bloquear o fluxo principal.
    }

    return updated;
  }
}
