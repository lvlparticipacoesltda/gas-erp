import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  buildDefaultStorePaymentMethods,
  canManagePaymentMethods,
  computePaymentProcessingFee,
  createStorePaymentMethodSchema,
  toNumber,
  updateStorePaymentMethodSchema,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { AuditService } from '../../common/audit/audit.service';

function serializePaymentMethod(row: {
  id: string;
  storeId: string;
  organizationId: string;
  systemCode: string | null;
  label: string;
  isCustom: boolean;
  enabled: boolean;
  sortOrder: number;
  feeMode: string;
  feePercent: unknown;
  feeFixed: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    storeId: row.storeId,
    organizationId: row.organizationId,
    systemCode: row.systemCode,
    label: row.label,
    isCustom: row.isCustom,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    feeMode: row.feeMode,
    feePercent: toNumber(row.feePercent),
    feeFixed: toNumber(row.feeFixed),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class StorePaymentMethodsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async seedForStore(storeId: string, organizationId: string) {
    const defaults = buildDefaultStorePaymentMethods();
    await this.prisma.storePaymentMethod.createMany({
      data: defaults.map((item) => ({
        storeId,
        organizationId,
        systemCode: item.systemCode,
        label: item.label,
        isCustom: item.isCustom,
        enabled: item.enabled,
        sortOrder: item.sortOrder,
        feeMode: item.feeMode,
        feePercent: item.feePercent,
        feeFixed: item.feeFixed,
      })),
      skipDuplicates: true,
    });
  }

  async findAll(user: AuthUser, storeId: string, activeOnly = false) {
    assertStoreAccess(user, storeId);
    await this.ensureStore(user, storeId);

    const rows = await this.prisma.storePaymentMethod.findMany({
      where: {
        storeId,
        ...(activeOnly ? { enabled: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    return rows.map(serializePaymentMethod);
  }

  async create(user: AuthUser, storeId: string, input: unknown) {
    this.assertCanManage(user);
    assertStoreAccess(user, storeId);
    const store = await this.ensureStore(user, storeId);
    const data = createStorePaymentMethodSchema.parse(input);

    const duplicate = await this.prisma.storePaymentMethod.findFirst({
      where: {
        storeId,
        label: { equals: data.label.trim(), mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw new BadRequestException('Já existe uma forma de pagamento com este nome.');
    }

    const maxSort = await this.prisma.storePaymentMethod.aggregate({
      where: { storeId },
      _max: { sortOrder: true },
    });

    const created = await this.prisma.storePaymentMethod.create({
      data: {
        storeId,
        organizationId: store.organizationId,
        label: data.label.trim(),
        isCustom: true,
        enabled: data.enabled,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        feeMode: data.feeMode,
        feePercent: data.feePercent,
        feeFixed: data.feeFixed,
      },
    });

    await this.audit.log(user, 'CREATE', 'StorePaymentMethod', created.id, {
      storeId,
      label: created.label,
    });

    return serializePaymentMethod(created);
  }

  async update(user: AuthUser, storeId: string, id: string, input: unknown) {
    this.assertCanManage(user);
    assertStoreAccess(user, storeId);
    await this.ensureStore(user, storeId);
    const existing = await this.findOwned(storeId, id);
    const data = updateStorePaymentMethodSchema.parse(input);

    if (data.label != null && existing.isCustom) {
      const duplicate = await this.prisma.storePaymentMethod.findFirst({
        where: {
          storeId,
          id: { not: id },
          label: { equals: data.label.trim(), mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw new BadRequestException('Já existe uma forma de pagamento com este nome.');
      }
    }

    if (data.label != null && !existing.isCustom) {
      throw new BadRequestException('O rótulo de formas padrão não pode ser alterado.');
    }

    const updated = await this.prisma.storePaymentMethod.update({
      where: { id },
      data: {
        ...(existing.isCustom && data.label != null ? { label: data.label.trim() } : {}),
        ...(data.enabled != null ? { enabled: data.enabled } : {}),
        ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
        ...(data.feeMode != null ? { feeMode: data.feeMode } : {}),
        ...(data.feePercent != null ? { feePercent: data.feePercent } : {}),
        ...(data.feeFixed != null ? { feeFixed: data.feeFixed } : {}),
      },
    });

    await this.audit.log(user, 'UPDATE', 'StorePaymentMethod', id, data as Record<string, unknown>);

    return serializePaymentMethod(updated);
  }

  async remove(user: AuthUser, storeId: string, id: string) {
    this.assertCanManage(user);
    assertStoreAccess(user, storeId);
    await this.ensureStore(user, storeId);
    const existing = await this.findOwned(storeId, id);

    if (!existing.isCustom) {
      throw new BadRequestException('Formas de pagamento padrão não podem ser excluídas. Desative-as.');
    }

    const usageCount = await this.prisma.salePayment.count({
      where: { storePaymentMethodId: id },
    });
    if (usageCount > 0) {
      throw new BadRequestException(
        'Esta forma de pagamento já foi usada em vendas. Desative-a em vez de excluir.',
      );
    }

    await this.prisma.storePaymentMethod.delete({ where: { id } });
    await this.audit.log(user, 'DELETE', 'StorePaymentMethod', id, { storeId, label: existing.label });
    return { ok: true };
  }

  async resolvePaymentsForSale(
    storeId: string,
    payments: Array<{ method?: PaymentMethod; storePaymentMethodId?: string; amount: number }>,
    options: { allowGdp?: boolean } = {},
  ) {
    const allowGdp = options.allowGdp ?? false;
    const storeMethods = await this.prisma.storePaymentMethod.findMany({
      where: { storeId },
    });
    const byId = new Map(storeMethods.map((m) => [m.id, m]));
    const bySystemCode = new Map(
      storeMethods.filter((m) => m.systemCode).map((m) => [m.systemCode as string, m]),
    );

    return payments.map((payment) => {
      let methodRecord = payment.storePaymentMethodId
        ? byId.get(payment.storePaymentMethodId)
        : payment.method
          ? bySystemCode.get(payment.method)
          : undefined;

      if (!methodRecord && payment.method) {
        methodRecord = bySystemCode.get(payment.method);
      }

      if (!methodRecord) {
        throw new BadRequestException('Forma de pagamento inválida ou indisponível para esta loja.');
      }

      const systemCode = methodRecord.systemCode as PaymentMethod | null;

      if (!methodRecord.enabled && !(allowGdp && systemCode === 'GDP')) {
        throw new BadRequestException(`Forma de pagamento "${methodRecord.label}" está desativada.`);
      }

      const method =
        systemCode ??
        (payment.method as PaymentMethod | undefined) ??
        PaymentMethod.OTHER;

      if (systemCode === 'GDP' && !allowGdp) {
        throw new BadRequestException('GDP só é permitido em vendas com benefício Gás do Povo.');
      }

      const processingFee = computePaymentProcessingFee(payment.amount, {
        feeMode: methodRecord.feeMode,
        feePercent: toNumber(methodRecord.feePercent),
        feeFixed: toNumber(methodRecord.feeFixed),
      });

      return {
        method,
        amount: payment.amount,
        storePaymentMethodId: methodRecord.id,
        processingFee,
      };
    });
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePaymentMethods(user.role)) {
      throw new ForbiddenException('Sem permissão para configurar formas de pagamento.');
    }
  }

  private async ensureStore(user: AuthUser, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: user.organizationId },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    return store;
  }

  private async findOwned(storeId: string, id: string) {
    const row = await this.prisma.storePaymentMethod.findFirst({
      where: { id, storeId },
    });
    if (!row) throw new NotFoundException('Forma de pagamento não encontrada');
    return row;
  }
}
