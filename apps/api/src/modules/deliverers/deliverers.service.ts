import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createDelivererSchema, updateDelivererSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';

@Injectable()
export class DeliverersService {
  constructor(private prisma: PrismaService) {}

  findAll(user: AuthUser, storeId?: string) {
    const where = storeId
      ? { storeId, store: { organizationId: user.organizationId } }
      : user.role === 'ORG_MASTER'
        ? { store: { organizationId: user.organizationId } }
        : { storeId: { in: user.storeIds } };

    if (storeId) assertStoreAccess(user, storeId);

    return this.prisma.deliverer.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        store: true,
      },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async create(user: AuthUser, input: unknown) {
    const data = createDelivererSchema.parse(input);
    assertStoreAccess(user, data.storeId);
    return this.prisma.deliverer.create({
      data: {
        userId: data.userId,
        storeId: data.storeId,
        status: data.status ?? 'AVAILABLE',
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        store: true,
      },
    });
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const data = updateDelivererSchema.parse(input);
    const deliverer = await this.prisma.deliverer.findUnique({
      where: { id },
      include: { store: true },
    });
    if (!deliverer || deliverer.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Entregador não encontrado');
    }
    assertStoreAccess(user, deliverer.storeId);
    return this.prisma.deliverer.update({
      where: { id },
      data: { storeId: data.storeId, status: data.status },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        store: true,
      },
    });
  }
}
