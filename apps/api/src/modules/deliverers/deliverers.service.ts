import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@gas-erp/database';
import { DeliveryStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { createDelivererSchema, registerPushTokenSchema, updateDelivererSchema, updateDelivererPositionSchema, DELIVERER_POSITION_STALE_MS, DELIVERER_POSITION_LIVE_MS, canManageDeliverers, canToggleDelivererAvailability } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess, assertScreenPermission } from '../../common/guards';
import { syncUserStoresForDeliverer } from '../../common/deliverer-store-sync';
import { AuditService } from '../../common/audit/audit.service';

function buildDeliveryAddress(sale: {
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryComplement: string | null;
  deliveryNeighborhood: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryLandmark: string | null;
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

@Injectable()
export class DeliverersService {
  private readonly logger = new Logger(DeliverersService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private readonly include = {
    user: { select: { id: true, name: true, email: true, phone: true, active: true } },
    stores: { include: { store: true } },
  } as const;

  findAll(user: AuthUser, storeId?: string) {
    if (storeId) assertStoreAccess(user, storeId);

    const where = storeId
      ? { stores: { some: { storeId, store: { organizationId: user.organizationId } } } }
      : user.role === 'ORG_MASTER'
        ? { stores: { some: { store: { organizationId: user.organizationId } } } }
        : { stores: { some: { storeId: { in: user.storeIds } } } };

    return this.prisma.deliverer
      .findMany({
        where,
        include: {
          ...this.include,
          _count: {
            select: {
              deliveries: { where: { status: 'PENDING' } },
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
      })
      .then((rows) =>
        rows.map(({ _count, ...deliverer }) => ({
          ...deliverer,
          pendingDeliveryCount: _count.deliveries,
        })),
      );
  }

  async getPositions(user: AuthUser, storeId: string) {
    assertStoreAccess(user, storeId);
    assertScreenPermission(user, 'store.deliverers.map');

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: user.organizationId },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const deliverers = await this.prisma.deliverer.findMany({
      where: {
        user: { active: true },
        status: { not: 'OFFLINE' },
        OR: [
          { stores: { some: { storeId, store: { organizationId: user.organizationId } } } },
          {
            deliveries: {
              some: {
                status: { in: ['PENDING', 'IN_PROGRESS'] },
                sale: { storeId, store: { organizationId: user.organizationId } },
              },
            },
          },
        ],
      },
      include: {
        user: { select: { name: true } },
        stores: { include: { store: { select: { id: true, name: true } } } },
        deliveries: {
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS'] },
            sale: { storeId, store: { organizationId: user.organizationId } },
          },
          select: {
            id: true,
            status: true,
            startedAt: true,
            createdAt: true,
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
                customer: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    if (deliverers.length === 0) return [];

    const delivererIds = deliverers.map((d) => d.id);
    const latestPoints = await this.prisma.$queryRaw<
      Array<{
        delivererId: string;
        latitude: number;
        longitude: number;
        recordedAt: Date;
        deliveryId: string;
        deliveryStatus: string;
      }>
    >`
      SELECT DISTINCT ON (d."delivererId")
        d."delivererId" AS "delivererId",
        tp.latitude,
        tp.longitude,
        tp."recordedAt" AS "recordedAt",
        d.id AS "deliveryId",
        d.status::text AS "deliveryStatus"
      FROM "DeliveryTrackingPoint" tp
      INNER JOIN "Delivery" d ON d.id = tp."deliveryId"
      WHERE d."delivererId" IN (${Prisma.join(delivererIds)})
      ORDER BY d."delivererId", tp."recordedAt" DESC
    `;

    const pointByDeliverer = new Map(latestPoints.map((p) => [p.delivererId, p]));
    const now = Date.now();

    return deliverers.map((deliverer) => {
      const trackingFallback = pointByDeliverer.get(deliverer.id);
      const storeDeliveries = deliverer.deliveries;
      const activeAtStore = storeDeliveries.find((d) => d.status === 'IN_PROGRESS');
      const pendingAtStore = storeDeliveries.filter((d) => d.status === 'PENDING');
      const hasActiveDelivery = !!activeAtStore;

      const delivererStatus = hasActiveDelivery
        ? 'ON_DELIVERY'
        : deliverer.status === 'ON_DELIVERY'
          ? 'AVAILABLE'
          : deliverer.status;

      const deliveryId = activeAtStore?.id ?? null;
      const deliveryStatus = activeAtStore?.status ?? null;
      const customerName = activeAtStore?.sale.customer?.name ?? null;
      const deliveryAddress = activeAtStore ? buildDeliveryAddress(activeAtStore.sale) : null;

      const pendingDeliveries = pendingAtStore.map((delivery) => ({
        id: delivery.id,
        assignedAt: delivery.createdAt.toISOString(),
        customerName: delivery.sale.customer?.name ?? null,
        deliveryAddress: buildDeliveryAddress(delivery.sale),
      }));

      const stores = deliverer.stores.map((s) => ({
        id: s.store.id,
        name: s.store.name,
      }));

      const deliveryFields = {
        deliveryId,
        deliveryStatus,
        routeStartedAt: activeAtStore?.startedAt?.toISOString() ?? null,
        customerName,
        deliveryAddress,
        pendingDeliveries,
      };

      const hasPresence =
        deliverer.lastLatitude !== null &&
        deliverer.lastLongitude !== null &&
        deliverer.lastSeenAt !== null;

      const latitude = hasPresence
        ? deliverer.lastLatitude
        : (trackingFallback?.latitude ?? null);
      const longitude = hasPresence
        ? deliverer.lastLongitude
        : (trackingFallback?.longitude ?? null);

      const seenAt = hasPresence
        ? deliverer.lastSeenAt!
        : (trackingFallback?.recordedAt ?? null);

      if (latitude === null || longitude === null || !seenAt) {
        return {
          delivererId: deliverer.id,
          name: deliverer.user.name,
          status: deliverer.status,
          delivererStatus,
          latitude: null,
          longitude: null,
          updatedAt: null,
          lastSeenAt: null,
          stale: true,
          isLive: false,
          batteryLevel: deliverer.batteryLevel,
          batteryCharging: deliverer.batteryCharging,
          ...deliveryFields,
          stores,
        };
      }

      const seenMs = seenAt.getTime();
      const stale = now - seenMs > DELIVERER_POSITION_STALE_MS;
      const isLive = now - seenMs <= DELIVERER_POSITION_LIVE_MS;
      const lastSeenAt = seenAt.toISOString();

      return {
        delivererId: deliverer.id,
        name: deliverer.user.name,
        status: deliverer.status,
        delivererStatus,
        latitude,
        longitude,
        updatedAt: lastSeenAt,
        lastSeenAt,
        stale,
        isLive,
        batteryLevel: deliverer.batteryLevel,
        batteryCharging: deliverer.batteryCharging,
        ...deliveryFields,
        stores,
      };
    });
  }

  async getMe(user: AuthUser) {
    if (user.role !== 'DELIVERER') {
      throw new ForbiddenException('Apenas entregadores podem consultar este perfil');
    }

    const deliverer = await this.prisma.deliverer.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        status: true,
        deliveries: {
          where: { status: DeliveryStatus.IN_PROGRESS },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');

    const hasActiveRoute = deliverer.deliveries.length > 0;
    const sharingLocation = deliverer.status !== 'OFFLINE' || hasActiveRoute;

    return {
      id: deliverer.id,
      status: deliverer.status,
      hasActiveRoute,
      sharingLocation,
    };
  }

  async updateMyPosition(user: AuthUser, input: unknown) {
    if (user.role !== 'DELIVERER') {
      throw new ForbiddenException('Apenas entregadores podem atualizar posição');
    }

    const data = updateDelivererPositionSchema.parse(input);
    const deliverer = await this.prisma.deliverer.findUnique({
      where: { userId: user.id },
      include: {
        deliveries: {
          where: { status: DeliveryStatus.IN_PROGRESS },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');

    if (deliverer.status === 'OFFLINE' && deliverer.deliveries.length === 0) {
      throw new ForbiddenException(
        'Você está indisponível. A loja pausou o compartilhamento da sua localização.',
      );
    }

    return this.prisma.deliverer.update({
      where: { id: deliverer.id },
      data: {
        lastLatitude: data.latitude,
        lastLongitude: data.longitude,
        lastAccuracy: data.accuracy,
        lastSeenAt: new Date(),
        ...(data.batteryLevel !== undefined ? { batteryLevel: data.batteryLevel } : {}),
        ...(data.batteryCharging !== undefined ? { batteryCharging: data.batteryCharging } : {}),
      },
      select: { id: true, lastSeenAt: true },
    });
  }

  async create(user: AuthUser, input: unknown) {
    const data = createDelivererSchema.parse(input);
    data.storeIds.forEach((storeId) => assertStoreAccess(user, storeId));
    await this.assertStoresInOrg(user, data.storeIds);

    const userId = data.userId ?? (await this.createDelivererUser(user, data));

    const existingDeliverer = await this.prisma.deliverer.findUnique({ where: { userId } });
    if (existingDeliverer) {
      throw new ConflictException('Este usuário já está cadastrado como entregador.');
    }

    const created = await this.prisma.deliverer.create({
      data: {
        userId,
        status: data.status ?? 'AVAILABLE',
        stores: { create: data.storeIds.map((storeId) => ({ storeId })) },
      },
      include: this.include,
    });
    await syncUserStoresForDeliverer(this.prisma, userId, data.storeIds);
    await this.audit.log(user, 'CREATE', 'Deliverer', created.id, {
      userId,
      storeIds: data.storeIds,
    });
    return created;
  }

  private async createDelivererUser(
    user: AuthUser,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      storeIds: string[];
    },
  ): Promise<string> {
    const email = data.email!;
    const existing = await this.prisma.user.findFirst({
      where: { organizationId: user.organizationId, email },
    });
    if (existing) {
      throw new ConflictException('Este e-mail já está cadastrado nesta rede.');
    }

    const passwordHash = await bcrypt.hash(data.password!, 10);
    const created = await this.prisma.user.create({
      data: {
        organizationId: user.organizationId,
        email,
        passwordHash,
        name: data.name!,
        phone: data.phone,
        role: 'DELIVERER',
        active: true,
        userStores: { create: data.storeIds.map((storeId) => ({ storeId })) },
      },
    });
    await this.audit.log(user, 'CREATE', 'User', created.id, { role: 'DELIVERER' });
    return created.id;
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const data = updateDelivererSchema.parse(input);
    const canManage = canManageDeliverers(user.role);
    const canToggleAvailability = canToggleDelivererAvailability(user.role, user.permissions);

    if (!canManage && !canToggleAvailability) {
      throw new ForbiddenException('Sem permissão para alterar entregadores');
    }

    if (!canManage && canToggleAvailability) {
      const restricted =
        data.storeIds !== undefined
        || data.active !== undefined
        || data.name !== undefined
        || data.email !== undefined
        || data.phone !== undefined
        || data.password !== undefined;
      if (restricted) {
        throw new ForbiddenException('Atendentes só podem alterar a disponibilidade do entregador');
      }
      if (data.status === undefined) {
        throw new BadRequestException('Informe o status (disponível ou indisponível)');
      }
    }

    const deliverer = await this.prisma.deliverer.findUnique({
      where: { id },
      include: { stores: { include: { store: true } } },
    });
    if (
      !deliverer ||
      !deliverer.stores.some((s) => s.store.organizationId === user.organizationId)
    ) {
      throw new NotFoundException('Entregador não encontrado');
    }
    deliverer.stores.forEach((s) => assertStoreAccess(user, s.storeId));

    if (data.storeIds) {
      data.storeIds.forEach((storeId) => assertStoreAccess(user, storeId));
      await this.assertStoresInOrg(user, data.storeIds);
    }

    const currentUser = await this.prisma.user.findUnique({ where: { id: deliverer.userId } });
    if (!currentUser) {
      throw new NotFoundException('Usuário do entregador não encontrado');
    }

    let normalizedEmail: string | undefined;
    if (data.email !== undefined) {
      normalizedEmail = data.email.trim().toLowerCase();
      if (normalizedEmail !== currentUser.email) {
        const existing = await this.prisma.user.findFirst({
          where: {
            organizationId: user.organizationId,
            email: normalizedEmail,
            NOT: { id: deliverer.userId },
          },
        });
        if (existing) {
          throw new ConflictException('Este e-mail já está cadastrado nesta rede.');
        }
      }
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;
    const hasUserUpdate =
      data.name !== undefined
      || normalizedEmail !== undefined
      || data.phone !== undefined
      || data.active !== undefined
      || passwordHash !== undefined;

    const nextStatus =
      data.active === false
        ? 'OFFLINE'
        : data.active === true && !data.status
          ? 'AVAILABLE'
          : data.status;

    if (nextStatus === 'OFFLINE') {
      const allocatedRoutes = await this.prisma.delivery.count({
        where: {
          delivererId: id,
          status: { in: [DeliveryStatus.IN_PROGRESS, DeliveryStatus.PENDING] },
        },
      });
      if (allocatedRoutes > 0) {
        throw new BadRequestException(
          'Entregador com rota alocada não pode ficar indisponível. Conclua, reatribua ou cancele a entrega primeiro.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (hasUserUpdate) {
        await tx.user.update({
          where: { id: deliverer.userId },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
            ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
            ...(data.active !== undefined ? { active: data.active } : {}),
            ...(passwordHash ? { passwordHash } : {}),
          },
        });
      }

      return tx.deliverer.update({
        where: { id },
        data: {
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(nextStatus === 'OFFLINE'
            ? {
                lastLatitude: null,
                lastLongitude: null,
                lastAccuracy: null,
                lastSeenAt: null,
              }
            : {}),
          ...(data.active === false
            ? { expoPushToken: null, pushTokenUpdatedAt: null }
            : {}),
          ...(data.storeIds
            ? {
                stores: {
                  deleteMany: {},
                  create: data.storeIds.map((storeId) => ({ storeId })),
                },
              }
            : {}),
        },
        include: this.include,
      });
    });

    if (data.storeIds) {
      await syncUserStoresForDeliverer(this.prisma, deliverer.userId, data.storeIds);
    }

    await this.audit.log(user, 'UPDATE', 'Deliverer', id, {
      active: data.active,
      status: nextStatus,
      name: data.name,
      email: normalizedEmail,
      phone: data.phone,
      passwordChanged: !!passwordHash,
    });

    return updated;
  }

  async registerPushToken(user: AuthUser, input: unknown) {
    if (user.role !== 'DELIVERER') {
      throw new ForbiddenException('Apenas entregadores podem registrar push token');
    }

    const parsed = registerPushTokenSchema.safeParse(input);
    if (!parsed.success) {
      this.logger.warn(
        `Push token rejeitado (usuário ${user.id}): ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
      throw new BadRequestException('Token Expo Push inválido');
    }

    const { token } = parsed.data;
    const deliverer = await this.prisma.deliverer.findUnique({ where: { userId: user.id } });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');

    const updated = await this.prisma.deliverer.update({
      where: { id: deliverer.id },
      data: { expoPushToken: token, pushTokenUpdatedAt: new Date() },
      select: { id: true, pushTokenUpdatedAt: true },
    });
    this.logger.log(`Push token registrado para entregador ${deliverer.id} (usuário ${user.id})`);
    return updated;
  }

  async clearPushToken(user: AuthUser) {
    if (user.role !== 'DELIVERER') {
      throw new ForbiddenException('Apenas entregadores podem remover push token');
    }

    const deliverer = await this.prisma.deliverer.findUnique({ where: { userId: user.id } });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');

    await this.prisma.deliverer.update({
      where: { id: deliverer.id },
      data: { expoPushToken: null, pushTokenUpdatedAt: null },
    });

    return { ok: true };
  }

  /** Garante que todas as lojas informadas pertencem à organização do usuário. */
  private async assertStoresInOrg(user: AuthUser, storeIds: string[]) {
    const count = await this.prisma.store.count({
      where: { id: { in: storeIds }, organizationId: user.organizationId },
    });
    if (count !== new Set(storeIds).size) {
      throw new NotFoundException('Uma ou mais unidades não foram encontradas.');
    }
  }
}
