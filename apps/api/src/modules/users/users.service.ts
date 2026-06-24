import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { createUserSchema, updateUserSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { AuditService } from '../../common/audit/audit.service';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(user: AuthUser, page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = { organizationId: user.organizationId };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        include: { userStores: { include: { store: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginatedResult(
      data.map(({ passwordHash: _, ...u }) => u),
      total,
      p,
      ps,
    );
  }

  async findOne(user: AuthUser, id: string) {
    const found = await this.prisma.user.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { userStores: { include: { store: true } } },
    });
    if (!found) throw new NotFoundException('Usuário não encontrado');
    const { passwordHash: _, ...safe } = found;
    return safe;
  }

  async create(user: AuthUser, input: unknown) {
    const data = createUserSchema.parse(input);
    const existing = await this.prisma.user.findFirst({
      where: { organizationId: user.organizationId, email: data.email },
    });
    if (existing) throw new ConflictException('Este e-mail já está cadastrado nesta rede');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const created = await this.prisma.user.create({
      data: {
        organizationId: user.organizationId,
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: data.role,
        active: data.active ?? true,
        permissions: data.permissions ?? [],
        userStores: data.storeIds?.length
          ? { create: data.storeIds.map((storeId) => ({ storeId })) }
          : undefined,
      },
      include: { userStores: { include: { store: true } } },
    });
    await this.audit.log(user, 'CREATE', 'User', created.id);
    const { passwordHash: _, ...safe } = created;
    return safe;
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const current = await this.findOne(user, id);
    const data = updateUserSchema.parse(input);

    if (data.email && data.email !== current.email) {
      const existing = await this.prisma.user.findFirst({
        where: { organizationId: user.organizationId, email: data.email, NOT: { id } },
      });
      if (existing) throw new ConflictException('Este e-mail já está cadastrado nesta rede');
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;

    if (data.storeIds) {
      await this.prisma.userStore.deleteMany({ where: { userId: id } });
      if (data.storeIds.length) {
        await this.prisma.userStore.createMany({
          data: data.storeIds.map((storeId) => ({ userId: id, storeId })),
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: data.role,
        active: data.active,
        permissions: data.permissions,
        passwordHash,
      },
      include: { userStores: { include: { store: true } } },
    });
    await this.audit.log(user, 'UPDATE', 'User', id);
    const { passwordHash: _, ...safe } = updated;
    return safe;
  }
}
