import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@gas-erp/database';
import {
  AuthUser,
  createVasilhameLoanSchema,
  updateVasilhameLoanSchema,
  type VasilhameLoanFilters,
} from '@gas-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertScreenPermission, assertStoreAccess } from '../../common/guards';
import { AuditService } from '../../common/audit/audit.service';
import { paginate, paginatedResult } from '../../common/utils/pagination';

const VASILHAME_LOAN_SCREEN = 'store.vasilhame-loans';

const LOAN_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  store: { select: { id: true, name: true, code: true } },
} satisfies Prisma.VasilhameLoanInclude;

@Injectable()
export class VasilhameLoansService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertAccess(user: AuthUser, storeId: string) {
    assertStoreAccess(user, storeId);
    assertScreenPermission(user, VASILHAME_LOAN_SCREEN);
  }

  async findAll(user: AuthUser, filters: VasilhameLoanFilters, page = 1, pageSize = 20) {
    this.assertAccess(user, filters.storeId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);

    const search = filters.search?.trim();
    const where: Prisma.VasilhameLoanWhereInput = {
      organizationId: user.organizationId,
      storeId: filters.storeId,
      ...(search
        ? {
            OR: [
              { responsibleName: { contains: search, mode: 'insensitive' as const } },
              { street: { contains: search, mode: 'insensitive' as const } },
              { neighborhood: { contains: search, mode: 'insensitive' as const } },
              { customer: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [data, total, aggregate] = await Promise.all([
      this.prisma.vasilhameLoan.findMany({
        where,
        skip,
        take,
        include: LOAN_INCLUDE,
        orderBy: [{ responsibleName: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.vasilhameLoan.count({ where }),
      // Total emprestado da unidade inteira, não só da página/filtro atual.
      this.prisma.vasilhameLoan.aggregate({
        where: { organizationId: user.organizationId, storeId: filters.storeId },
        _sum: { quantity: true },
      }),
    ]);

    return {
      ...paginatedResult(data, total, p, ps),
      totalQuantity: aggregate._sum.quantity ?? 0,
    };
  }

  async findOne(user: AuthUser, id: string) {
    const loan = await this.prisma.vasilhameLoan.findFirst({
      where: { id, organizationId: user.organizationId },
      include: LOAN_INCLUDE,
    });
    if (!loan) throw new NotFoundException('Empréstimo não encontrado');
    this.assertAccess(user, loan.storeId);
    return loan;
  }

  async create(user: AuthUser, input: unknown) {
    const data = createVasilhameLoanSchema.parse(input);
    this.assertAccess(user, data.storeId);
    await this.assertCustomerInStore(user, data.customerId, data.storeId);

    const loan = await this.prisma.vasilhameLoan.create({
      data: {
        organizationId: user.organizationId,
        storeId: data.storeId,
        customerId: data.customerId ?? null,
        responsibleName: data.responsibleName.trim(),
        responsiblePhone: data.responsiblePhone ?? null,
        street: data.street.trim(),
        number: data.number ?? null,
        complement: data.complement ?? null,
        neighborhood: data.neighborhood ?? null,
        city: data.city.trim(),
        state: data.state.trim().toUpperCase(),
        zipCode: data.zipCode ?? null,
        landmark: data.landmark ?? null,
        quantity: data.quantity,
        notes: data.notes ?? null,
        createdById: user.id,
        updatedById: user.id,
      },
      include: LOAN_INCLUDE,
    });

    await this.audit.log(user, 'CREATE', 'VasilhameLoan', loan.id, {
      storeId: loan.storeId,
      responsibleName: loan.responsibleName,
      quantity: loan.quantity,
    });

    return loan;
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const current = await this.findOne(user, id);
    const data = updateVasilhameLoanSchema.parse(input);
    if (data.customerId) {
      await this.assertCustomerInStore(user, data.customerId, current.storeId);
    }

    const loan = await this.prisma.vasilhameLoan.update({
      where: { id },
      data: {
        ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
        ...(data.responsibleName !== undefined
          ? { responsibleName: data.responsibleName.trim() }
          : {}),
        ...(data.responsiblePhone !== undefined
          ? { responsiblePhone: data.responsiblePhone ?? null }
          : {}),
        ...(data.street !== undefined ? { street: data.street.trim() } : {}),
        ...(data.number !== undefined ? { number: data.number ?? null } : {}),
        ...(data.complement !== undefined ? { complement: data.complement ?? null } : {}),
        ...(data.neighborhood !== undefined ? { neighborhood: data.neighborhood ?? null } : {}),
        ...(data.city !== undefined ? { city: data.city.trim() } : {}),
        ...(data.state !== undefined ? { state: data.state.trim().toUpperCase() } : {}),
        ...(data.zipCode !== undefined ? { zipCode: data.zipCode ?? null } : {}),
        ...(data.landmark !== undefined ? { landmark: data.landmark ?? null } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
        updatedById: user.id,
      },
      include: LOAN_INCLUDE,
    });

    await this.audit.log(user, 'UPDATE', 'VasilhameLoan', id, {
      previousQuantity: current.quantity,
      quantity: loan.quantity,
    });

    return loan;
  }

  async remove(user: AuthUser, id: string) {
    const current = await this.findOne(user, id);
    await this.prisma.vasilhameLoan.delete({ where: { id } });

    await this.audit.log(user, 'DELETE', 'VasilhameLoan', id, {
      storeId: current.storeId,
      responsibleName: current.responsibleName,
      quantity: current.quantity,
    });

    return { ok: true };
  }

  /** Cliente vinculado precisa ser da mesma organização e unidade do empréstimo. */
  private async assertCustomerInStore(
    user: AuthUser,
    customerId: string | null | undefined,
    storeId: string,
  ) {
    if (!customerId) return;
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: user.organizationId, storeId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado nesta unidade');
  }
}
