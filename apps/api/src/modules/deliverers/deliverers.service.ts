import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createDelivererSchema, registerPushTokenSchema, updateDelivererSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';

@Injectable()
export class DeliverersService {
  constructor(private prisma: PrismaService) {}

  private readonly include = {
    user: { select: { id: true, name: true, email: true, phone: true } },
    stores: { include: { store: true } },
  } as const;

  findAll(user: AuthUser, storeId?: string) {
    if (storeId) assertStoreAccess(user, storeId);

    const where = storeId
      ? { stores: { some: { storeId, store: { organizationId: user.organizationId } } } }
      : user.role === 'ORG_MASTER'
        ? { stores: { some: { store: { organizationId: user.organizationId } } } }
        : { stores: { some: { storeId: { in: user.storeIds } } } };

    return this.prisma.deliverer.findMany({
      where,
      include: this.include,
      orderBy: { user: { name: 'asc' } },
    });
  }

  async create(user: AuthUser, input: unknown) {
    const data = createDelivererSchema.parse(input);
    data.storeIds.forEach((storeId) => assertStoreAccess(user, storeId));
    await this.assertStoresInOrg(user, data.storeIds);

    return this.prisma.deliverer.create({
      data: {
        userId: data.userId,
        status: data.status ?? 'AVAILABLE',
        stores: { create: data.storeIds.map((storeId) => ({ storeId })) },
      },
      include: this.include,
    });
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const data = updateDelivererSchema.parse(input);
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

    return this.prisma.deliverer.update({
      where: { id },
      data: {
        status: data.status,
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
  }

  async registerPushToken(user: AuthUser, input: unknown) {
    if (user.role !== 'DELIVERER') {
      throw new ForbiddenException('Apenas entregadores podem registrar push token');
    }

    const { token } = registerPushTokenSchema.parse(input);
    const deliverer = await this.prisma.deliverer.findUnique({ where: { userId: user.id } });
    if (!deliverer) throw new NotFoundException('Perfil de entregador não encontrado');

    return this.prisma.deliverer.update({
      where: { id: deliverer.id },
      data: { expoPushToken: token, pushTokenUpdatedAt: new Date() },
      select: { id: true, pushTokenUpdatedAt: true },
    });
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
