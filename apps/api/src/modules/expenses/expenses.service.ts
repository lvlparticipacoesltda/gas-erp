import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  DEFAULT_EXPENSE_CATEGORIES,
  EXPENSE_STORE_FILTER_ORG,
  canViewExpenses,
  createExpenseCategorySchema,
  createExpenseSchema,
  payExpenseSchema,
  sumExpenseAmounts,
  toNumber,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  type ExpenseFilters,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { AuditService } from '../../common/audit/audit.service';
import { paginate, paginatedResult } from '../../common/utils/pagination';
import { dateKeyToUtcDate, dateOnlyRangeBounds } from '../../common/utils/business-day';
import { formatCsvMoney, formatDateKey, toCsv } from '../../common/utils/csv';

/** `Date` de coluna `@db.Date` → `AAAA-MM-DD` (sempre lido em UTC). */
function toDateKey(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Soma `months` meses a uma chave de data, sem estourar para o mês seguinte. */
function addMonthsToDateKey(dateKey: string, months: number): string {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const target = new Date(Date.UTC(y, mo - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

const EXPENSE_INCLUDE = {
  category: { select: { id: true, name: true, icon: true, color: true } },
  store: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, legalName: true, tradeName: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertAccess(user: AuthUser) {
    if (!canViewExpenses(user.role)) {
      throw new ForbiddenException('Sem acesso ao painel de custos');
    }
  }

  private isOrgWide(user: AuthUser): boolean {
    return user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN';
  }

  /**
   * Escopo de leitura/escrita.
   * - `storeId=org` → apenas despesas da organização (sem unidade).
   * - `storeId=<id>` → aquela unidade (validando acesso).
   * - sem filtro → master vê a organização inteira; financeiro vê as lojas às
   *   quais tem acesso **mais** as despesas da organização, que também são dele.
   */
  private buildScopeWhere(user: AuthUser, storeId?: string): Prisma.ExpenseWhereInput {
    const base = { organizationId: user.organizationId };
    if (storeId === EXPENSE_STORE_FILTER_ORG) return { ...base, storeId: null };
    if (storeId) {
      assertStoreAccess(user, storeId);
      return { ...base, storeId };
    }
    if (this.isOrgWide(user)) return base;
    return {
      ...base,
      OR: [{ storeId: { in: user.storeIds } }, { storeId: null }],
    };
  }

  private buildFilterWhere(user: AuthUser, filters: ExpenseFilters): Prisma.ExpenseWhereInput {
    const where: Prisma.ExpenseWhereInput = this.buildScopeWhere(user, filters.storeId);

    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom ?? filters.dateTo!;
      const to = filters.dateTo ?? filters.dateFrom!;
      if (from > to) {
        throw new BadRequestException('A data inicial não pode ser posterior à data final.');
      }
      where.expenseDate = dateOnlyRangeBounds(from, to);
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      const search = filters.search.trim();
      if (search) {
        where.AND = [
          {
            OR: [
              { description: { contains: search, mode: 'insensitive' } },
              { supplierName: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
              { supplier: { legalName: { contains: search, mode: 'insensitive' } } },
              { supplier: { tradeName: { contains: search, mode: 'insensitive' } } },
            ],
          },
        ];
      }
    }
    return where;
  }

  /* --------------------------------- Gastos -------------------------------- */

  async findAll(user: AuthUser, filters: ExpenseFilters, page = 1, pageSize = 20) {
    this.assertAccess(user);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = this.buildFilterWhere(user, filters);

    const [rows, total, totals] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip,
        take,
        include: EXPENSE_INCLUDE,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.expense.count({ where }),
      // Total do filtro inteiro (não só da página), para o rodapé da tabela.
      // Cancelados ficam de fora, salvo quando são justamente o que se filtrou.
      this.prisma.expense.aggregate({
        where: filters.status ? where : { ...where, status: { not: 'CANCELLED' } },
        _sum: { amount: true },
      }),
    ]);

    return {
      ...paginatedResult(rows.map((row) => this.serialize(row)), total, p, ps),
      filteredTotal: toNumber(totals._sum.amount),
    };
  }

  async findOne(user: AuthUser, id: string) {
    this.assertAccess(user);
    const expense = await this.prisma.expense.findFirst({
      where: { AND: [{ id }, this.buildScopeWhere(user)] },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw new NotFoundException('Gasto não encontrado');
    return this.serialize(expense);
  }

  async create(user: AuthUser, input: unknown) {
    this.assertAccess(user);
    const data = createExpenseSchema.parse(input);
    if (data.storeId) assertStoreAccess(user, data.storeId);
    await this.assertCategory(user, data.categoryId);
    if (data.supplierId) await this.assertSupplier(user, data.supplierId);

    const installments = data.installments ?? 1;
    const recurrenceGroupId = installments > 1 ? randomUUID() : null;
    const status = data.status ?? (data.paidAt ? 'PAID' : 'PENDING');

    const rows = Array.from({ length: installments }, (_, index) => {
      const expenseDate = addMonthsToDateKey(data.expenseDate, index);
      const dueDate = data.dueDate ? addMonthsToDateKey(data.dueDate, index) : null;
      // Só a primeira parcela herda o pagamento informado; as futuras nascem pendentes.
      const isFirst = index === 0;
      return {
        organizationId: user.organizationId,
        storeId: data.storeId ?? null,
        categoryId: data.categoryId,
        description:
          installments > 1
            ? `${data.description} (${index + 1}/${installments})`
            : data.description,
        expenseDate: dateKeyToUtcDate(expenseDate),
        dueDate: dueDate ? dateKeyToUtcDate(dueDate) : null,
        paidAt: isFirst && data.paidAt ? dateKeyToUtcDate(data.paidAt) : null,
        amount: data.amount,
        status: isFirst ? status : ('PENDING' as const),
        supplierId: data.supplierId ?? null,
        supplierName: data.supplierName ?? null,
        paymentLabel: data.paymentLabel ?? null,
        notes: data.notes ?? null,
        recurrenceGroupId,
        installment: installments > 1 ? index + 1 : null,
        installments: installments > 1 ? installments : null,
        createdById: user.id,
        updatedById: user.id,
      };
    });

    if (rows.length === 1) {
      const created = await this.prisma.expense.create({
        data: rows[0],
        include: EXPENSE_INCLUDE,
      });
      await this.audit.log(user, 'CREATE', 'Expense', created.id, {
        amount: data.amount,
        storeId: data.storeId ?? null,
      });
      return this.serialize(created);
    }

    await this.prisma.expense.createMany({ data: rows });
    await this.audit.log(user, 'CREATE', 'Expense', recurrenceGroupId ?? undefined, {
      installments,
      amount: data.amount,
      storeId: data.storeId ?? null,
    });
    const created = await this.prisma.expense.findMany({
      where: { recurrenceGroupId },
      include: EXPENSE_INCLUDE,
      orderBy: { expenseDate: 'asc' },
    });
    return created.map((row) => this.serialize(row));
  }

  async update(user: AuthUser, id: string, input: unknown) {
    this.assertAccess(user);
    await this.findOne(user, id);
    const data = updateExpenseSchema.parse(input);
    if (data.storeId) assertStoreAccess(user, data.storeId);
    if (data.categoryId) await this.assertCategory(user, data.categoryId);
    if (data.supplierId) await this.assertSupplier(user, data.supplierId);

    if (data.status === 'PAID' && data.paidAt === null) {
      throw new BadRequestException('Informe a data do pagamento');
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(data.storeId !== undefined ? { storeId: data.storeId } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.expenseDate !== undefined
          ? { expenseDate: dateKeyToUtcDate(data.expenseDate) }
          : {}),
        ...(data.dueDate !== undefined
          ? { dueDate: data.dueDate ? dateKeyToUtcDate(data.dueDate) : null }
          : {}),
        ...(data.paidAt !== undefined
          ? { paidAt: data.paidAt ? dateKeyToUtcDate(data.paidAt) : null }
          : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.supplierId !== undefined ? { supplierId: data.supplierId } : {}),
        ...(data.supplierName !== undefined ? { supplierName: data.supplierName } : {}),
        ...(data.paymentLabel !== undefined ? { paymentLabel: data.paymentLabel } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        updatedById: user.id,
      },
      include: EXPENSE_INCLUDE,
    });
    await this.audit.log(user, 'UPDATE', 'Expense', id, data as Record<string, unknown>);
    return this.serialize(updated);
  }

  async pay(user: AuthUser, id: string, input: unknown) {
    this.assertAccess(user);
    const current = await this.findOne(user, id);
    if (current.status === 'CANCELLED') {
      throw new BadRequestException('Gasto cancelado não pode ser pago');
    }
    const data = payExpenseSchema.parse(input ?? {});
    const paidAt = data.paidAt ?? new Date().toISOString().slice(0, 10);

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: dateKeyToUtcDate(paidAt),
        ...(data.paymentLabel ? { paymentLabel: data.paymentLabel } : {}),
        updatedById: user.id,
      },
      include: EXPENSE_INCLUDE,
    });
    await this.audit.log(user, 'PAY', 'Expense', id, { paidAt });
    return this.serialize(updated);
  }

  async remove(user: AuthUser, id: string) {
    this.assertAccess(user);
    await this.findOne(user, id);
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log(user, 'DELETE', 'Expense', id);
    return { ok: true };
  }

  /* -------------------------------- Resumo --------------------------------- */

  /**
   * Cartões do painel: total do período, pago vs pendente, quebra por categoria
   * e por unidade, e evolução dos últimos 6 meses.
   *
   * Cancelados ficam fora de todos os totais (salvo filtro explícito por status).
   */
  async summary(user: AuthUser, filters: ExpenseFilters) {
    this.assertAccess(user);
    const where = this.buildFilterWhere(user, filters);
    const activeWhere: Prisma.ExpenseWhereInput = filters.status
      ? where
      : { ...where, status: { not: 'CANCELLED' } };

    const referenceMonth = monthKey(filters.dateTo ?? new Date().toISOString().slice(0, 10));
    const [refYear, refMonth] = referenceMonth.split('-').map(Number);
    const historyStart = new Date(Date.UTC(refYear, refMonth - 6, 1))
      .toISOString()
      .slice(0, 10);
    const historyEnd = new Date(Date.UTC(refYear, refMonth, 0)).toISOString().slice(0, 10);

    const [rows, byStatus, historyRows, stores] = await Promise.all([
      this.prisma.expense.findMany({
        where: activeWhere,
        select: {
          amount: true,
          storeId: true,
          categoryId: true,
          category: { select: { name: true, icon: true, color: true } },
        },
      }),
      this.prisma.expense.groupBy({
        by: ['status'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.expense.findMany({
        where: {
          ...this.buildScopeWhere(user, filters.storeId),
          ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
          status: { not: 'CANCELLED' },
          expenseDate: dateOnlyRangeBounds(historyStart, historyEnd),
        },
        select: { amount: true, expenseDate: true },
      }),
      this.prisma.store.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
      }),
    ]);

    const storeNameById = new Map(stores.map((store) => [store.id, store.name]));

    const byCategoryMap = new Map<
      string,
      { categoryId: string; name: string; icon: string | null; color: string | null; total: number; count: number }
    >();
    const byStoreMap = new Map<string, { storeId: string | null; name: string; total: number; count: number }>();

    for (const row of rows) {
      const amount = toNumber(row.amount);

      const category = byCategoryMap.get(row.categoryId) ?? {
        categoryId: row.categoryId,
        name: row.category.name,
        icon: row.category.icon,
        color: row.category.color,
        total: 0,
        count: 0,
      };
      category.total += amount;
      category.count += 1;
      byCategoryMap.set(row.categoryId, category);

      const storeKey = row.storeId ?? EXPENSE_STORE_FILTER_ORG;
      const store = byStoreMap.get(storeKey) ?? {
        storeId: row.storeId,
        name: row.storeId ? (storeNameById.get(row.storeId) ?? 'Unidade') : 'Empresa (rateado)',
        total: 0,
        count: 0,
      };
      store.total += amount;
      store.count += 1;
      byStoreMap.set(storeKey, store);
    }

    const totalByStatus = (status: string) =>
      toNumber(byStatus.find((row) => row.status === status)?._sum.amount);

    const total = sumExpenseAmounts(rows);
    const paid = totalByStatus('PAID');
    const pending = totalByStatus('PENDING');

    const historyByMonth = new Map<string, number>();
    for (let offset = 5; offset >= 0; offset -= 1) {
      const key = new Date(Date.UTC(refYear, refMonth - 1 - offset, 1)).toISOString().slice(0, 7);
      historyByMonth.set(key, 0);
    }
    for (const row of historyRows) {
      const key = toDateKey(row.expenseDate)!.slice(0, 7);
      if (historyByMonth.has(key)) {
        historyByMonth.set(key, historyByMonth.get(key)! + toNumber(row.amount));
      }
    }

    return {
      total,
      paid,
      pending,
      cancelled: totalByStatus('CANCELLED'),
      count: rows.length,
      byCategory: [...byCategoryMap.values()].sort((a, b) => b.total - a.total),
      byStore: [...byStoreMap.values()].sort((a, b) => b.total - a.total),
      byMonth: [...historyByMonth.entries()].map(([month, value]) => ({ month, total: value })),
    };
  }

  async exportCsv(user: AuthUser, filters: ExpenseFilters) {
    this.assertAccess(user);
    const where = this.buildFilterWhere(user, filters);
    const rows = await this.prisma.expense.findMany({
      where,
      include: EXPENSE_INCLUDE,
      orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
    });

    const headers = [
      'Data',
      'Vencimento',
      'Pagamento',
      'Descrição',
      'Categoria',
      'Unidade',
      'Fornecedor',
      'Forma de pagamento',
      'Valor',
      'Status',
    ];
    const body = rows.map((row) => {
      const serialized = this.serialize(row);
      return [
        formatDateKey(serialized.expenseDate),
        serialized.dueDate ? formatDateKey(serialized.dueDate) : '',
        serialized.paidAt ? formatDateKey(serialized.paidAt) : '',
        serialized.description,
        serialized.category.name,
        serialized.store?.name ?? 'Empresa (rateado)',
        serialized.supplierLabel ?? '',
        serialized.paymentLabel ?? '',
        formatCsvMoney(serialized.amount),
        serialized.status,
      ];
    });

    const from = filters.dateFrom ?? 'inicio';
    const to = filters.dateTo ?? 'fim';
    return {
      filename: `gastos-${from}_a_${to}.csv`,
      csv: toCsv(headers, body),
    };
  }

  /* ------------------------------ Categorias ------------------------------- */

  /** Semeia as categorias padrão na primeira vez que a organização abre o painel. */
  private async ensureDefaultCategories(organizationId: string) {
    const existing = await this.prisma.expenseCategory.count({ where: { organizationId } });
    if (existing > 0) return;
    await this.prisma.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((category, index) => ({
        organizationId,
        name: category.name,
        icon: category.icon,
        color: category.color,
        sortOrder: index,
        system: true,
      })),
      skipDuplicates: true,
    });
  }

  async listCategories(user: AuthUser, includeInactive = false) {
    this.assertAccess(user);
    await this.ensureDefaultCategories(user.organizationId);
    return this.prisma.expenseCategory.findMany({
      where: {
        organizationId: user.organizationId,
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(user: AuthUser, input: unknown) {
    this.assertAccess(user);
    const data = createExpenseCategorySchema.parse(input);
    const duplicate = await this.prisma.expenseCategory.findFirst({
      where: { organizationId: user.organizationId, name: data.name },
    });
    if (duplicate) throw new BadRequestException('Já existe uma categoria com esse nome');

    const created = await this.prisma.expenseCategory.create({
      data: {
        organizationId: user.organizationId,
        name: data.name,
        icon: data.icon ?? null,
        color: data.color ?? null,
        sortOrder: data.sortOrder ?? 100,
      },
    });
    await this.audit.log(user, 'CREATE', 'ExpenseCategory', created.id, { name: data.name });
    return created;
  }

  async updateCategory(user: AuthUser, id: string, input: unknown) {
    this.assertAccess(user);
    const category = await this.findCategory(user, id);
    const data = updateExpenseCategorySchema.parse(input);

    const updated = await this.prisma.expenseCategory.update({
      where: { id: category.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.icon !== undefined ? { icon: data.icon ?? null } : {}),
        ...(data.color !== undefined ? { color: data.color ?? null } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    await this.audit.log(user, 'UPDATE', 'ExpenseCategory', id, data as Record<string, unknown>);
    return updated;
  }

  /** Categoria do sistema ou com gastos vinculados é apenas inativada. */
  async removeCategory(user: AuthUser, id: string) {
    this.assertAccess(user);
    const category = await this.findCategory(user, id);
    const used = await this.prisma.expense.count({ where: { categoryId: id } });

    if (category.system || used > 0) {
      const updated = await this.prisma.expenseCategory.update({
        where: { id },
        data: { active: false },
      });
      await this.audit.log(user, 'DEACTIVATE', 'ExpenseCategory', id, { used });
      return updated;
    }

    await this.prisma.expenseCategory.delete({ where: { id } });
    await this.audit.log(user, 'DELETE', 'ExpenseCategory', id);
    return { ok: true };
  }

  private async findCategory(user: AuthUser, id: string) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!category) throw new NotFoundException('Categoria não encontrada');
    return category;
  }

  private async assertCategory(user: AuthUser, categoryId: string) {
    await this.findCategory(user, categoryId);
  }

  private async assertSupplier(user: AuthUser, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
  }

  /** Datas viram chaves `AAAA-MM-DD` e Decimal vira number, como o web espera. */
  private serialize(row: Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>) {
    return {
      ...row,
      amount: toNumber(row.amount),
      expenseDate: toDateKey(row.expenseDate)!,
      dueDate: toDateKey(row.dueDate),
      paidAt: toDateKey(row.paidAt),
      supplierLabel:
        row.supplier?.tradeName || row.supplier?.legalName || row.supplierName || null,
    };
  }
}
