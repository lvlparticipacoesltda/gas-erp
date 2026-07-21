import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseInvoiceStatus } from '@gas-erp/database';
import type { Prisma } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createPurchaseInvoiceSchema,
  updatePurchaseInvoiceSchema,
  importPurchaseInvoiceSchema,
  DEFAULT_PURCHASE_PAYMENT_CATEGORY,
  productTypeRequiresVasilhame,
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
    store: { select: { id: true, name: true } },
  };

  /**
   * Monta o filtro de escopo das notas.
   * - Com storeId: restringe à loja (validando acesso).
   * - Sem storeId: ORG_MASTER/PLATFORM_ADMIN veem toda a organização;
   *   demais usuários veem apenas as lojas às quais têm acesso.
   */
  private buildScopeWhere(
    user: AuthUser,
    storeId?: string,
  ): Prisma.PurchaseInvoiceWhereInput {
    if (storeId) {
      assertStoreAccess(user, storeId);
      return { storeId };
    }
    if (user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN') {
      return { store: { organizationId: user.organizationId } };
    }
    return { storeId: { in: user.storeIds } };
  }

  async findAll(user: AuthUser, storeId?: string, page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = this.buildScopeWhere(user, storeId);
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

  /**
   * Resumo de entrada de botijões (produtos GLP) por unidade, a partir de notas
   * de compra CONFIRMADAS. Usado no painel master para acompanhar quantos
   * botijões entraram em cada loja.
   */
  async cylinderEntries(
    user: AuthUser,
    storeId?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const scope = this.buildScopeWhere(user, storeId);

    const issueDate: Prisma.DateTimeFilter = {};
    if (dateFrom) issueDate.gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo) {
      const end = new Date(`${dateTo}T00:00:00`);
      end.setDate(end.getDate() + 1);
      issueDate.lt = end;
    }

    const items = await this.prisma.purchaseInvoiceItem.findMany({
      where: {
        product: { productType: 'GLP' },
        invoice: {
          status: PurchaseInvoiceStatus.CONFIRMED,
          ...scope,
          ...(dateFrom || dateTo ? { issueDate } : {}),
        },
      },
      select: {
        quantity: true,
        product: { select: { id: true, name: true, sku: true } },
        invoice: { select: { storeId: true, store: { select: { name: true } } } },
      },
    });

    const storeMap = new Map<
      string,
      {
        storeId: string;
        storeName: string;
        totalQty: number;
        products: Map<string, { productId: string; name: string; sku: string; qty: number }>;
      }
    >();

    for (const item of items) {
      const sId = item.invoice.storeId;
      let store = storeMap.get(sId);
      if (!store) {
        store = {
          storeId: sId,
          storeName: item.invoice.store?.name ?? 'Unidade',
          totalQty: 0,
          products: new Map(),
        };
        storeMap.set(sId, store);
      }
      store.totalQty += item.quantity;

      const pId = item.product.id;
      const prod = store.products.get(pId);
      if (prod) {
        prod.qty += item.quantity;
      } else {
        store.products.set(pId, {
          productId: pId,
          name: item.product.name,
          sku: item.product.sku,
          qty: item.quantity,
        });
      }
    }

    const stores = [...storeMap.values()]
      .map((store) => ({
        storeId: store.storeId,
        storeName: store.storeName,
        totalQty: store.totalQty,
        products: [...store.products.values()].sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => b.totalQty - a.totalQty);

    return {
      stores,
      totalQty: stores.reduce((sum, s) => sum + s.totalQty, 0),
    };
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
    await this.assertVasilhameStock(user, data.storeId, data.items);

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

  /**
   * Trava de entrada de botijões/garrafões: a quantidade de um produto "cheio"
   * (GLP ou Água) lançada na nota não pode exceder o estoque de vasilhames
   * (vazios) correspondentes disponível na unidade. Cada produto cheio precisa
   * ter um vasilhame vinculado no cadastro.
   */
  private async assertVasilhameStock(
    user: AuthUser,
    storeId: string,
    items: { productId: string; quantity: number }[],
  ) {
    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...qtyByProduct.keys()] }, organizationId: user.organizationId },
      select: { id: true, name: true, productType: true, vasilhameProductId: true },
    });

    const neededByVasilhame = new Map<string, number>();
    for (const product of products) {
      if (!productTypeRequiresVasilhame(product.productType)) continue;
      const needed = qtyByProduct.get(product.id) ?? 0;
      if (needed <= 0) continue;
      if (!product.vasilhameProductId) {
        throw new BadRequestException(
          `Vincule um vasilhame ao produto "${product.name}" (no cadastro de produtos) para lançar a entrada.`,
        );
      }
      neededByVasilhame.set(
        product.vasilhameProductId,
        (neededByVasilhame.get(product.vasilhameProductId) ?? 0) + needed,
      );
    }

    if (neededByVasilhame.size === 0) return;

    const vasilhameIds = [...neededByVasilhame.keys()];
    const [vasilhames, balances] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: vasilhameIds } },
        select: { id: true, name: true },
      }),
      this.prisma.stockBalance.findMany({
        where: { storeId, productId: { in: vasilhameIds } },
        select: { productId: true, available: true },
      }),
    ]);
    const nameById = new Map(vasilhames.map((v) => [v.id, v.name]));
    const availableById = new Map(balances.map((b) => [b.productId, b.available]));

    for (const [vasilhameId, needed] of neededByVasilhame) {
      const available = availableById.get(vasilhameId) ?? 0;
      if (needed > available) {
        const vasName = nameById.get(vasilhameId) ?? 'vasilhame';
        throw new BadRequestException(
          `Estoque de vasilhame insuficiente: "${vasName}" tem ${available} em estoque nesta unidade, mas a nota exige ${needed}.`,
        );
      }
    }
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
