import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { createUserSchema, updateUserSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { AuditService } from '../../common/audit/audit.service';
import { syncDelivererStoresForUser } from '../../common/deliverer-store-sync';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(
    user: AuthUser,
    page = 1,
    pageSize = 20,
    filters: { search?: string; role?: string; active?: string } = {},
  ) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const search = filters.search?.trim();
    const role = filters.role?.trim();
    const where = {
      organizationId: user.organizationId,
      role: role
        ? (role as 'ORG_MASTER' | 'STORE_MANAGER' | 'ATTENDANT' | 'FINANCE' | 'PLATFORM_ADMIN')
        : ({ not: 'DELIVERER' as const }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(filters.active === 'true'
        ? { active: true }
        : filters.active === 'false'
          ? { active: false }
          : {}),
    };
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
        cpf: data.cpf,
        pis: data.pis,
        admittedAt: data.admittedAt ? new Date(`${data.admittedAt}T12:00:00.000Z`) : undefined,
        jobTitle: data.jobTitle ?? undefined,
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
    if (created.role === 'DELIVERER') {
      const storeIds = created.userStores.map((us) => us.storeId);
      await syncDelivererStoresForUser(this.prisma, created.id, storeIds);
    }
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
        ...(data.cpf !== undefined ? { cpf: data.cpf ?? null } : {}),
        ...(data.pis !== undefined ? { pis: data.pis ?? null } : {}),
        ...(data.admittedAt !== undefined
          ? { admittedAt: data.admittedAt ? new Date(`${data.admittedAt}T12:00:00.000Z`) : null }
          : {}),
        ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle ?? null } : {}),
        role: data.role,
        active: data.active,
        permissions: data.permissions,
        passwordHash,
      },
      include: { userStores: { include: { store: true } } },
    });
    if (data.active === false) {
      await this.prisma.workScheduleWeekly.updateMany({
        where: { userId: id, organizationId: user.organizationId },
        data: { active: false },
      });
      await this.prisma.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokeReason: 'revoked_by_admin',
        },
      });
    }
    await this.audit.log(user, 'UPDATE', 'User', id);
    if (updated.role === 'DELIVERER') {
      const storeIds = updated.userStores.map((us) => us.storeId);
      await syncDelivererStoresForUser(this.prisma, updated.id, storeIds);
    }
    const { passwordHash: _, ...safe } = updated;
    return safe;
  }

  async remove(user: AuthUser, id: string) {
    if (user.id === id) {
      throw new BadRequestException('Você não pode excluir seu próprio usuário');
    }
    const target = await this.findOne(user, id);
    if (target.role === 'DELIVERER') {
      throw new BadRequestException('Entregadores devem ser gerenciados na aba Entregadores.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.updateMany({ where: { attendantId: id }, data: { attendantId: null } });
      await tx.sale.updateMany({ where: { backdateApprovedById: id }, data: { backdateApprovedById: null } });
      await tx.sale.updateMany({ where: { mobileApprovedById: id }, data: { mobileApprovedById: null } });
      await tx.saleStatusLog.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.saleBackdateLog.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.saleMobileApprovalLog.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.stockMovement.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.auditLog.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.user.delete({ where: { id } });
    });
    await this.audit.log(user, 'DELETE', 'User', id);
    return { ok: true };
  }

  private mapSession(row: {
    id: string;
    client: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
    revokeReason: string | null;
    user: { id: string; name: string; email: string; role: string };
  }) {
    const now = Date.now();
    const end = row.revokedAt?.getTime() ?? now;
    return {
      id: row.id,
      userId: row.user.id,
      userName: row.user.name,
      userEmail: row.user.email,
      userRole: row.user.role,
      client: row.client,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revokeReason: row.revokeReason,
      active: row.revokedAt == null,
      durationSeconds: Math.max(0, Math.floor((end - row.createdAt.getTime()) / 1000)),
    };
  }

  /** Sessões da organização (master). */
  async listSessions(
    user: AuthUser,
    page = 1,
    pageSize = 20,
    filters: {
      active?: string;
      search?: string;
      userId?: string;
      /** staff = painel (não entregador) | deliverer | all/vazio */
      audience?: string;
    } = {},
  ) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const search = filters.search?.trim();
    const audience = filters.audience?.trim().toLowerCase();
    const roleFilter =
      audience === 'deliverer' || audience === 'entregador'
        ? { role: 'DELIVERER' as const }
        : audience === 'staff' || audience === 'attendant' || audience === 'atendente'
          ? { role: { not: 'DELIVERER' as const } }
          : {};

    const userWhere = {
      organizationId: user.organizationId,
      ...(filters.userId ? { id: filters.userId } : {}),
      ...roleFilter,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const include = {
      user: { select: { id: true, name: true, email: true, role: true } },
    } as const;

    const activeOnly = filters.active === 'true';
    const inactiveOnly = filters.active === 'false';

    // Filtro Ativas / Encerradas: ordenação simples por última atividade.
    if (activeOnly || inactiveOnly) {
      const where = {
        user: userWhere,
        ...(activeOnly ? { revokedAt: null } : { revokedAt: { not: null } }),
      };
      const [rows, total] = await Promise.all([
        this.prisma.userSession.findMany({
          where,
          skip,
          take,
          include,
          orderBy: { lastSeenAt: 'desc' },
        }),
        this.prisma.userSession.count({ where }),
      ]);
      return paginatedResult(rows.map((r) => this.mapSession(r)), total, p, ps);
    }

    // Status=Todas: ativas primeiro, depois encerradas (ambas por lastSeenAt desc).
    // Não usar orderBy em revokedAt nullable — em PostgreSQL ASC coloca NULLS LAST
    // (ativas no fim) e nulls:'first' do Prisma não é confiável aqui com paginação.
    const activeWhere = { user: userWhere, revokedAt: null };
    const inactiveWhere = { user: userWhere, revokedAt: { not: null } };

    const [activeTotal, inactiveTotal] = await Promise.all([
      this.prisma.userSession.count({ where: activeWhere }),
      this.prisma.userSession.count({ where: inactiveWhere }),
    ]);
    const total = activeTotal + inactiveTotal;

    if (skip < activeTotal) {
      const activeTake = Math.min(take, activeTotal - skip);
      const actives = await this.prisma.userSession.findMany({
        where: activeWhere,
        skip,
        take: activeTake,
        include,
        orderBy: { lastSeenAt: 'desc' },
      });
      const remaining = take - actives.length;
      const inactives =
        remaining > 0
          ? await this.prisma.userSession.findMany({
              where: inactiveWhere,
              skip: 0,
              take: remaining,
              include,
              orderBy: { lastSeenAt: 'desc' },
            })
          : [];
      return paginatedResult(
        [...actives, ...inactives].map((r) => this.mapSession(r)),
        total,
        p,
        ps,
      );
    }

    const inactives = await this.prisma.userSession.findMany({
      where: inactiveWhere,
      skip: skip - activeTotal,
      take,
      include,
      orderBy: { lastSeenAt: 'desc' },
    });
    return paginatedResult(inactives.map((r) => this.mapSession(r)), total, p, ps);
  }

  async revokeSession(user: AuthUser, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        user: { organizationId: user.organizationId },
      },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.revokedAt) return { ok: true, alreadyRevoked: true };

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokeReason: 'revoked_by_admin' },
    });
    return { ok: true };
  }
}
