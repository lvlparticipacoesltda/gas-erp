import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createStoreSchema, updateStoreSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { AuditService } from '../../common/audit/audit.service';
import { StorePaymentMethodsService } from './store-payment-methods.service';

@Injectable()
export class StoresService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private paymentMethods: StorePaymentMethodsService,
  ) {}

  findAll(user: AuthUser) {
    const where =
      user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN'
        ? { organizationId: user.organizationId }
        : { id: { in: user.storeIds }, organizationId: user.organizationId };

    return this.prisma.store.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const store = await this.prisma.store.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    if (user.role !== 'ORG_MASTER' && user.role !== 'PLATFORM_ADMIN' && !user.storeIds.includes(id)) {
      throw new NotFoundException('Loja não encontrada');
    }
    return store;
  }

  async create(user: AuthUser, input: unknown) {
    const data = createStoreSchema.parse(input);
    const store = await this.prisma.store.create({
      data: { ...data, organizationId: user.organizationId },
    });
    await this.paymentMethods.seedForStore(store.id, store.organizationId);
    await this.audit.log(user, 'CREATE', 'Store', store.id, data as Record<string, unknown>);
    return store;
  }

  async update(user: AuthUser, id: string, input: unknown) {
    await this.findOne(user, id);
    const data = updateStoreSchema.parse(input);
    const store = await this.prisma.store.update({ where: { id }, data });
    await this.audit.log(user, 'UPDATE', 'Store', id, data as Record<string, unknown>);
    return store;
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    const salesCount = await this.prisma.sale.count({ where: { storeId: id } });
    if (salesCount > 0) {
      throw new BadRequestException(
        'Esta loja possui vendas registradas e não pode ser excluída. Você pode inativá-la.',
      );
    }
    await this.prisma.store.delete({ where: { id } });
    await this.audit.log(user, 'DELETE', 'Store', id);
    return { ok: true };
  }
}
