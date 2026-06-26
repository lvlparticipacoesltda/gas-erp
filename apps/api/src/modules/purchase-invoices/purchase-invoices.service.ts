import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseInvoiceStatus } from '@gas-erp/database';
import type { Prisma } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createPurchaseInvoiceSchema,
  updatePurchaseInvoiceSchema,
  importPurchaseInvoiceSchema,
  DEFAULT_PURCHASE_PAYMENT_CATEGORY,
  type AuthUser,
} from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { StockService } from '../stock/stock.service';
import { AuditService } from '../../common/audit/audit.service';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
  ) {}

  private invoiceInclude = {
    supplier: { select: { id: true, legalName: true, tradeName: true, document: true } },
    items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
    payments: { orderBy: { installment: 'asc' as const } },
  };

  async findAll(user: AuthUser, storeId: string, page = 1, pageSize = 20) {
    assertStoreAccess(user, storeId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where: Prisma.PurchaseInvoiceWhereInput = { storeId };
    const [data, total] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where,
        skip,
        take,
        include: this.invoiceInclude,
        orderBy: { issueDate: 'desc' },
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return paginatedResult(data, total, p, ps);
  }

  async findOne(user: AuthUser, id: string) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { id },
      include: { ...this.invoiceInclude, store: true },
    });
    if (!invoice || invoice.store.organizationId !== user.organizationId) {
      throw new NotFoundException('Nota de compra não encontrada');
    }
    assertStoreAccess(user, invoice.storeId);
    return invoice;
  }

  async create(user: AuthUser, input: unknown) {
    const data = createPurchaseInvoiceSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    await this.validateReferences(user, data.storeId, data.supplierId, data.items);

    const items = data.items.map((item) => {
      const discount = item.discount ?? 0;
      const total = item.quantity * item.unitPrice - discount;
      if (total < 0) {
        throw new BadRequestException('Desconto não pode ser maior que o valor do item.');
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount,
        total,
        paymentDate: item.paymentDate ? new Date(`${item.paymentDate}T00:00:00`) : null,
      };
    });

    const total = items.reduce((sum, item) => sum + item.total, 0);

    const payments = (
      data.payments?.length
        ? data.payments
        : [
            {
              category: DEFAULT_PURCHASE_PAYMENT_CATEGORY,
              dueDate: data.issueDate,
              amount: total,
              installment: 1,
            },
          ]
    ).map((payment, index) => ({
      category: payment.category,
      dueDate: new Date(`${payment.dueDate}T00:00:00`),
      amount: payment.amount,
      installment: payment.installment ?? index + 1,
    }));

    const created = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.create({
        data: {
          storeId: data.storeId,
          supplierId: data.supplierId,
          number: data.number,
          issueDate: new Date(`${data.issueDate}T00:00:00`),
          total,
          notes: data.notes || null,
          status: PurchaseInvoiceStatus.CONFIRMED,
          items: { create: items },
          payments: { create: payments },
        },
        select: { id: true },
      });

      for (const item of items) {
        await this.stockService.addForPurchase(
          tx,
          data.storeId,
          item.productId,
          item.quantity,
          user.id,
          invoice.id,
        );
      }

      return invoice;
    });

    try {
      await this.audit.log(user, 'CREATE', 'PurchaseInvoice', created.id, {
        storeId: data.storeId,
        supplierId: data.supplierId,
        number: data.number,
        total,
      });
    } catch {
      // Auditoria não deve bloquear o fluxo.
    }

    return this.findOne(user, created.id);
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const invoice = await this.findOne(user, id);
    if (invoice.status === PurchaseInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Nota cancelada não pode ser alterada.');
    }
    const data = updatePurchaseInvoiceSchema.parse(input);

    if (data.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: data.supplierId, organizationId: user.organizationId, active: true },
      });
      if (!supplier) throw new BadRequestException('Fornecedor não encontrado.');
    }

    await this.prisma.purchaseInvoice.update({
      where: { id },
      data: {
        ...(data.number !== undefined ? { number: data.number } : {}),
        ...(data.supplierId !== undefined ? { supplierId: data.supplierId } : {}),
        ...(data.issueDate !== undefined
          ? { issueDate: new Date(`${data.issueDate}T00:00:00`) }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      },
    });

    return this.findOne(user, id);
  }

  /** Cancela a nota e estorna a entrada de estoque de cada item. */
  async cancel(user: AuthUser, id: string) {
    const invoice = await this.findOne(user, id);
    if (invoice.status === PurchaseInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Nota já está cancelada.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of invoice.items) {
        await this.stockService.reverseForCancelledPurchase(
          tx,
          invoice.storeId,
          item.productId,
          item.quantity,
          user.id,
          invoice.id,
        );
      }
      await tx.purchaseInvoice.update({
        where: { id },
        data: { status: PurchaseInvoiceStatus.CANCELLED },
      });
    });

    try {
      await this.audit.log(user, 'CANCEL', 'PurchaseInvoice', id, {
        storeId: invoice.storeId,
        number: invoice.number,
      });
    } catch {
      // Auditoria não deve bloquear o fluxo.
    }

    return this.findOne(user, id);
  }

  /**
   * Stub de "Utilizar dados da nota" (importação de NF-e).
   *
   * TODO(fiscal): integrar com FiscalProvider real para fazer o parse do XML /
   * consulta por chave de acesso e retornar fornecedor + itens reais. Por ora
   * devolve um esqueleto pré-preenchido para o formulário não bloquear o módulo.
   */
  async importFromNfe(user: AuthUser, input: unknown) {
    const data = importPurchaseInvoiceSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    return {
      imported: false,
      provider: 'stub',
      message:
        'Importação de NF-e ainda não implementada (stub). Preencha os dados manualmente.',
      prefilled: {
        number: '',
        issueDate: null as string | null,
        accessKey: data.accessKey ?? null,
        supplier: null,
        items: [] as unknown[],
      },
    };
  }

  private async validateReferences(
    user: AuthUser,
    storeId: string,
    supplierId: string,
    items: { productId: string }[],
  ) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: user.organizationId },
    });
    if (!store) throw new BadRequestException('Loja não encontrada.');

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId, active: true },
    });
    if (!supplier) throw new BadRequestException('Fornecedor não encontrado.');

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: user.organizationId, active: true },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Produto não encontrado ou inativo.');
    }
  }
}
