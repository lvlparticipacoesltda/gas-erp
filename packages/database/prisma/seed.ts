import bcrypt from 'bcryptjs';
import {
  BackdateApprovalStatus,
  DelivererStatus,
  DeliveryStatus,
  ExpenseStatus,
  PaymentFeeMode,
  PaymentMethod,
  Prisma,
  PrismaClient,
  SaleChannel,
  SaleStatus,
  UserRole,
} from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed de desenvolvimento.
 *
 * Além do cadastro base (org, unidades, usuários, produtos), gera massa transacional
 * do mês passado até hoje para que "Resultado por unidade" tenha o que apurar: vendas
 * com CMV e taxa de cartão, e gastos por categoria em cada unidade.
 *
 * As unidades têm perfis de margem propositalmente diferentes — SV saudável, STS
 * intermediária e PG no vermelho — para dar contraste à análise vertical da tela.
 *
 * É idempotente: toda linha gerada tem id com prefixo `seed-`, e a massa é apagada e
 * recriada a cada execução. Vendas e gastos criados à mão na interface não são tocados.
 */

const DEMO_TIMEZONE_OFFSET_HOURS = 3; // America/Sao_Paulo (UTC-3), sem horário de verão.

/** PRNG determinístico (LCG) — a mesma seed gera sempre a mesma massa. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = makeRandom(20260805);

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pickWeighted<T extends { weight: number }>(options: T[]): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let ticket = random() * total;
  for (const option of options) {
    ticket -= option.weight;
    if (ticket <= 0) return option;
  }
  return options[options.length - 1];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Meio-dia no fuso das lojas — longe das bordas do dia em qualquer conversão. */
function localNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12 + DEMO_TIMEZONE_OFFSET_HOURS, 0, 0));
}

/** Data pura (`@db.Date`) — sem componente de hora. */
function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/**
 * Taxa de processamento do pagamento. Espelha `computePaymentProcessingFee` de
 * @gas-erp/shared (o pacote database não depende de shared) — se a regra mudar lá,
 * mude aqui também, senão a massa deixa de bater com o que a API calcula.
 */
function computeProcessingFee(
  amount: number,
  config: { feeMode: PaymentFeeMode; feePercent: number; feeFixed: number },
): number {
  switch (config.feeMode) {
    case PaymentFeeMode.PERCENT:
      return round2(amount * (config.feePercent / 100));
    case PaymentFeeMode.FIXED:
      return round2(config.feeFixed);
    case PaymentFeeMode.PERCENT_AND_FIXED:
      return round2(amount * (config.feePercent / 100) + config.feeFixed);
    default:
      return 0;
  }
}

interface StoreProfile {
  code: string;
  name: string;
  city: string;
  address: string;
  /** Faixa de vendas por dia — define o porte da unidade. */
  salesPerDay: [number, number];
  stock: number;
}

const STORE_PROFILES: StoreProfile[] = [
  {
    code: 'SV',
    name: 'Unidade São Vicente',
    city: 'São Vicente',
    address: 'Av. Principal, 100',
    salesPerDay: [8, 13],
    stock: 600,
  },
  {
    code: 'STS',
    name: 'Unidade Santos',
    city: 'Santos',
    address: 'Rua do Comércio, 200',
    salesPerDay: [5, 9],
    stock: 420,
  },
  {
    code: 'PG',
    name: 'Unidade Praia Grande',
    city: 'Praia Grande',
    address: 'Av. da Praia, 300',
    salesPerDay: [2, 5],
    stock: 300,
  },
  {
    code: 'GRU',
    name: 'Unidade Guarujá',
    city: 'Guarujá',
    address: 'Av. Marechal Deodoro, 450',
    salesPerDay: [6, 10],
    stock: 480,
  },
  {
    code: 'ITA',
    name: 'Unidade Itanhaém',
    city: 'Itanhaém',
    address: 'Rua Cunha Moreira, 88',
    salesPerDay: [3, 6],
    stock: 320,
  },
];

/**
 * Preço e custo por unidade. PG compra mais caro e vende mais barato de propósito:
 * é a unidade que fecha no vermelho depois do rateio dos gastos fixos.
 */
const PRODUCT_PRICING: Record<string, Record<string, { price: number; cost: number }>> = {
  'GLP-P13': {
    SV: { price: 120, cost: 92 },
    STS: { price: 125, cost: 96 },
    PG: { price: 115, cost: 97 },
    GRU: { price: 122, cost: 93 },
    ITA: { price: 118, cost: 95 },
  },
  'GLP-P20': {
    SV: { price: 180, cost: 139 },
    STS: { price: 188, cost: 145 },
    PG: { price: 175, cost: 146 },
    GRU: { price: 184, cost: 141 },
    ITA: { price: 178, cost: 144 },
  },
  'GLP-P45': {
    SV: { price: 350, cost: 268 },
    STS: { price: 360, cost: 279 },
    PG: { price: 345, cost: 281 },
    GRU: { price: 355, cost: 271 },
    ITA: { price: 348, cost: 280 },
  },
  'VAS-P13': {
    SV: { price: 0, cost: 0 },
    STS: { price: 0, cost: 0 },
    PG: { price: 0, cost: 0 },
    GRU: { price: 0, cost: 0 },
    ITA: { price: 0, cost: 0 },
  },
};

/** Mix de venda — P13 domina, como no varejo real de GLP. */
const PRODUCT_MIX = [
  { sku: 'GLP-P13', weight: 78, maxQuantity: 2 },
  { sku: 'GLP-P20', weight: 15, maxQuantity: 2 },
  { sku: 'GLP-P45', weight: 7, maxQuantity: 1 },
];

const PAYMENT_METHOD_SEEDS = [
  {
    systemCode: PaymentMethod.CASH,
    label: 'Dinheiro',
    feeMode: PaymentFeeMode.NONE,
    feePercent: 0,
    feeFixed: 0,
    enabled: true,
    weight: 28,
  },
  {
    systemCode: PaymentMethod.PIX,
    label: 'PIX',
    feeMode: PaymentFeeMode.NONE,
    feePercent: 0,
    feeFixed: 0,
    enabled: true,
    weight: 34,
  },
  {
    systemCode: PaymentMethod.DEBIT_CARD,
    label: 'Cartão de Débito',
    feeMode: PaymentFeeMode.PERCENT,
    feePercent: 1.49,
    feeFixed: 0,
    enabled: true,
    weight: 16,
  },
  {
    systemCode: PaymentMethod.CREDIT_CARD,
    label: 'Cartão de Crédito',
    feeMode: PaymentFeeMode.PERCENT_AND_FIXED,
    feePercent: 3.19,
    feeFixed: 0.39,
    enabled: true,
    weight: 19,
  },
  {
    systemCode: PaymentMethod.CUSTOMER_CREDIT,
    label: 'Crédito de Cliente',
    feeMode: PaymentFeeMode.NONE,
    feePercent: 0,
    feeFixed: 0,
    enabled: true,
    weight: 3,
  },
  {
    systemCode: PaymentMethod.CHECK,
    label: 'Cheque',
    feeMode: PaymentFeeMode.NONE,
    feePercent: 0,
    feeFixed: 0,
    enabled: false,
    weight: 0,
  },
  {
    systemCode: PaymentMethod.GDP,
    label: 'GDP (Gás do Povo)',
    feeMode: PaymentFeeMode.NONE,
    feePercent: 0,
    feeFixed: 0,
    enabled: false,
    weight: 0,
  },
  {
    systemCode: PaymentMethod.OTHER,
    label: 'Outro',
    feeMode: PaymentFeeMode.NONE,
    feePercent: 0,
    feeFixed: 0,
    enabled: true,
    weight: 0,
  },
];

/**
 * Composição dos gastos da empresa, como fração do orçamento mensal da unidade.
 *
 * O valor sai do faturamento realizado no mês (ver `EXPENSE_BUDGET_RATIO`) em vez de
 * ser fixo: assim a massa continua coerente mesmo quando o volume de vendas sorteado
 * muda, e a análise vertical da tela mostra percentuais estáveis.
 *
 * `day` é a data de competência. `'month-end'` marca o que fecha no último dia do mês
 * (folha e benefícios) — no mês corrente esses ainda não foram lançados, exatamente
 * como no fluxo real.
 */
const EXPENSE_PLAN: {
  category: string;
  weight: number;
  day: number | 'month-end';
  variable: boolean;
}[] = [
  { category: 'Folha de pagamento', weight: 0.34, day: 'month-end', variable: false },
  { category: 'Aluguel', weight: 0.2, day: 1, variable: false },
  { category: 'Combustível', weight: 0.09, day: 15, variable: true },
  { category: 'Impostos e taxas', weight: 0.08, day: 20, variable: true },
  { category: 'Benefícios', weight: 0.06, day: 'month-end', variable: false },
  { category: 'Luz', weight: 0.055, day: 12, variable: true },
  { category: 'Manutenção de veículos', weight: 0.05, day: 18, variable: true },
  { category: 'Contabilidade', weight: 0.045, day: 8, variable: false },
  { category: 'Internet e telefone', weight: 0.025, day: 10, variable: false },
  { category: 'Marketing', weight: 0.025, day: 22, variable: true },
  { category: 'Outros', weight: 0.02, day: 25, variable: true },
  { category: 'Água', weight: 0.015, day: 12, variable: false },
];

/**
 * Orçamento de gastos como % do faturamento da unidade. Combinado com a margem bruta
 * de cada uma, produz o leque que a tela deve evidenciar: SV e Guarujá lucrativas,
 * Santos apertada, Itanhaém no zero a zero e Praia Grande no vermelho.
 */
const EXPENSE_BUDGET_RATIO: Record<string, number> = {
  SV: 0.17,
  STS: 0.195,
  PG: 0.26,
  GRU: 0.185,
  ITA: 0.2,
};

const CUSTOMER_NAMES: Record<string, string[]> = {
  SV: ['Maria Silva', 'Restaurante Maré Alta', 'Padaria Central', 'Condomínio Vila Nova'],
  STS: ['José Ferreira', 'Pizzaria do Porto', 'Mercado Bom Preço', 'Ana Duarte'],
  PG: ['Carla Mendes', 'Quiosque Praia Sol', 'Lanchonete da Esquina'],
  GRU: ['Paulo Ribeiro', 'Hotel Enseada', 'Churrascaria Tortuga', 'Márcia Lopes'],
  ITA: ['Sônia Barbosa', 'Camping Cibratel', 'Sorveteria Litoral'],
};

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed não deve ser executado em produção.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash('admin123', 10);

  const org = await prisma.organization.upsert({
    where: { slug: 'gas-rede-litoral' },
    update: {},
    create: {
      name: 'Rede Gás Litoral',
      slug: 'gas-rede-litoral',
    },
  });

  const stores = await Promise.all(
    STORE_PROFILES.map((profile) =>
      prisma.store.upsert({
        where: { organizationId_code: { organizationId: org.id, code: profile.code } },
        update: { active: true },
        create: {
          organizationId: org.id,
          name: profile.name,
          code: profile.code,
          city: profile.city,
          state: 'SP',
          address: profile.address,
        },
      }),
    ),
  );
  const storeByCode = new Map(stores.map((store) => [store.code, store]));

  const master = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'master@gas.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'master@gas.com',
      passwordHash,
      name: 'Administrador Master',
      role: UserRole.ORG_MASTER,
    },
  });

  const manager = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'gerente@gas.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'gerente@gas.com',
      passwordHash,
      name: 'Gerente São Vicente',
      role: UserRole.STORE_MANAGER,
      userStores: { create: { storeId: stores[0].id } },
    },
  });

  // Um atendente e dois entregadores por unidade — as vendas geradas são atribuídas a
  // eles. São dois porque a tabela de desempenho da Visão geral existe para comparar
  // entregadores; com um por unidade, a visão da loja teria uma linha só.
  const attendantByStore = new Map<string, string>();
  const delivererIdsByStore = new Map<string, string[]>();
  const delivererUsers: string[] = [];

  for (const profile of STORE_PROFILES) {
    const store = storeByCode.get(profile.code)!;
    const suffix = profile.code.toLowerCase();
    const isFirst = profile.code === 'SV';

    const attendant = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: org.id,
          email: isFirst ? 'atendente@gas.com' : `atendente.${suffix}@gas.com`,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        email: isFirst ? 'atendente@gas.com' : `atendente.${suffix}@gas.com`,
        passwordHash,
        name: `Atendente ${profile.city}`,
        role: UserRole.ATTENDANT,
        userStores: { create: { storeId: store.id } },
      },
    });
    attendantByStore.set(store.id, attendant.id);

    // O primeiro entregador de SV mantém `entregador@gas.com` — é a credencial de
    // demonstração divulgada no fim da seed.
    const delivererSlots = [
      {
        email: isFirst ? 'entregador@gas.com' : `entregador.${suffix}@gas.com`,
        name: isFirst ? 'João Entregador' : `Entregador ${profile.city}`,
      },
      {
        email: isFirst ? 'entregador2@gas.com' : `entregador2.${suffix}@gas.com`,
        name: isFirst ? 'Marcos Entregador' : `Entregador ${profile.city} 2`,
      },
    ];

    const delivererIds: string[] = [];
    for (const slot of delivererSlots) {
      const delivererUser = await prisma.user.upsert({
        where: { organizationId_email: { organizationId: org.id, email: slot.email } },
        update: {},
        create: {
          organizationId: org.id,
          email: slot.email,
          passwordHash,
          name: slot.name,
          role: UserRole.DELIVERER,
          userStores: { create: { storeId: store.id } },
        },
      });
      delivererUsers.push(delivererUser.email);

      const deliverer = await prisma.deliverer.upsert({
        where: { userId: delivererUser.id },
        update: { availableStoreId: store.id, defaultStoreId: store.id },
        create: {
          userId: delivererUser.id,
          status: DelivererStatus.AVAILABLE,
          availableStoreId: store.id,
          defaultStoreId: store.id,
        },
      });
      delivererIds.push(deliverer.id);

      await prisma.delivererStore.upsert({
        where: { delivererId_storeId: { delivererId: deliverer.id, storeId: store.id } },
        update: {},
        create: { delivererId: deliverer.id, storeId: store.id },
      });
    }

    delivererIdsByStore.set(store.id, delivererIds);
  }

  // Formas de pagamento por unidade — sem elas a tela de venda trava no pagamento, e
  // as taxas de cartão (que viram `processingFee`) não existiriam no resultado.
  for (const store of stores) {
    for (const [index, method] of PAYMENT_METHOD_SEEDS.entries()) {
      await prisma.storePaymentMethod.upsert({
        where: { storeId_systemCode: { storeId: store.id, systemCode: method.systemCode } },
        update: {
          label: method.label,
          enabled: method.enabled,
          feeMode: method.feeMode,
          feePercent: method.feePercent,
          feeFixed: method.feeFixed,
          sortOrder: index,
        },
        create: {
          storeId: store.id,
          organizationId: org.id,
          systemCode: method.systemCode,
          label: method.label,
          enabled: method.enabled,
          feeMode: method.feeMode,
          feePercent: method.feePercent,
          feeFixed: method.feeFixed,
          sortOrder: index,
        },
      });
    }
  }

  const paymentMethodsByStore = new Map(
    await Promise.all(
      stores.map(
        async (store) =>
          [
            store.id,
            await prisma.storePaymentMethod.findMany({ where: { storeId: store.id } }),
          ] as const,
      ),
    ),
  );

  const customerCategories = await Promise.all(
    (['P13', 'P20', 'P45', 'Gás do Povo'] as const).map((name) =>
      prisma.customerCategory.upsert({
        where: { organizationId_name: { organizationId: org.id, name } },
        update: { active: true },
        create: { organizationId: org.id, name },
      }),
    ),
  );
  const defaultCustomerCategory = customerCategories[0];

  // Categorias de gastos da empresa. Espelha DEFAULT_EXPENSE_CATEGORIES de
  // @gas-erp/shared (o pacote database não depende de shared).
  const expenseCategoryDefs = [
    { name: 'Aluguel', icon: 'building-2', color: '#f97316' },
    { name: 'Água', icon: 'droplets', color: '#0ea5e9' },
    { name: 'Luz', icon: 'zap', color: '#eab308' },
    { name: 'Internet e telefone', icon: 'wifi', color: '#8b5cf6' },
    { name: 'Folha de pagamento', icon: 'users', color: '#3b82f6' },
    { name: 'Benefícios', icon: 'ticket', color: '#06b6d4' },
    { name: 'Rescisão', icon: 'user-minus', color: '#9333ea' },
    { name: 'Impostos e taxas', icon: 'landmark', color: '#ef4444' },
    { name: 'Manutenção de veículos', icon: 'wrench', color: '#64748b' },
    { name: 'Manutenção de unidade', icon: 'hammer', color: '#a16207' },
    { name: 'Combustível', icon: 'fuel', color: '#dc2626' },
    { name: 'Transporte', icon: 'truck', color: '#4f46e5' },
    { name: 'Material', icon: 'package', color: '#84cc16' },
    { name: 'Contabilidade', icon: 'calculator', color: '#14b8a6' },
    { name: 'Marketing', icon: 'megaphone', color: '#ec4899' },
    { name: 'Outros', icon: 'circle-ellipsis', color: '#94a3b8' },
  ];
  const expenseCategories = await Promise.all(
    expenseCategoryDefs.map((cat, index) =>
      prisma.expenseCategory.upsert({
        where: { organizationId_name: { organizationId: org.id, name: cat.name } },
        update: { icon: cat.icon, color: cat.color, sortOrder: index, active: true },
        create: {
          organizationId: org.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          sortOrder: index,
          system: true,
        },
      }),
    ),
  );
  const expenseCategoryByName = new Map(expenseCategories.map((cat) => [cat.name, cat.id]));

  // Clientes por unidade (ids determinísticos para a massa poder referenciá-los).
  const customersByStore = new Map<string, string[]>();
  for (const profile of STORE_PROFILES) {
    const store = storeByCode.get(profile.code)!;
    const ids: string[] = [];
    for (const [index, name] of CUSTOMER_NAMES[profile.code].entries()) {
      const id = `seed-customer-${profile.code}-${index + 1}`;
      await prisma.customer.upsert({
        where: { id },
        update: { name, storeId: store.id, active: true },
        create: {
          id,
          organizationId: org.id,
          storeId: store.id,
          categoryId: defaultCustomerCategory.id,
          name,
          phone: `1399${profile.code.length}${String(index + 1).padStart(6, '0')}`,
          addresses: {
            create: {
              label: 'Principal',
              street: `Rua ${name.split(' ')[0]}`,
              number: String(100 + index * 37),
              neighborhood: 'Centro',
              city: profile.city,
              state: 'SP',
              isDefault: true,
            },
          },
        },
      });
      ids.push(id);
    }
    customersByStore.set(store.id, ids);
  }

  const products = await Promise.all(
    [
      { sku: 'GLP-P13', name: 'GLP 13KG', productType: 'GLP' },
      { sku: 'GLP-P20', name: 'GLP 20KG', productType: 'GLP' },
      { sku: 'GLP-P45', name: 'GLP 45KG', productType: 'GLP' },
      { sku: 'VAS-P13', name: 'Vasilhame 13KG', productType: 'CANISTER' },
    ].map(async (p) => {
      const product = await prisma.product.upsert({
        where: { organizationId_sku: { organizationId: org.id, sku: p.sku } },
        update: {},
        create: {
          organizationId: org.id,
          sku: p.sku,
          name: p.name,
          productType: p.productType,
        },
      });

      for (const profile of STORE_PROFILES) {
        const store = storeByCode.get(profile.code)!;
        const pricing = PRODUCT_PRICING[p.sku][profile.code];
        // `supplierCost` é a origem do `unitCost` gravado na venda — sem ele o CMV
        // (e portanto a margem) sai zerado no resultado por unidade.
        await prisma.productStoreSetting.upsert({
          where: { productId_storeId: { productId: product.id, storeId: store.id } },
          update: { price: pricing.price, supplierCost: pricing.cost },
          create: {
            productId: product.id,
            storeId: store.id,
            price: pricing.price,
            supplierCost: pricing.cost,
          },
        });
        await prisma.stockBalance.upsert({
          where: { productId_storeId: { productId: product.id, storeId: store.id } },
          update: { available: profile.stock },
          create: { productId: product.id, storeId: store.id, available: profile.stock },
        });
      }
      return product;
    }),
  );
  const productBySku = new Map(products.map((product) => [product.sku, product]));

  // Vincula o GLP 13KG (cheio) ao vasilhame 13KG (vazio) para a trava de entrada.
  const glp13 = productBySku.get('GLP-P13');
  const vas13 = productBySku.get('VAS-P13');
  if (glp13 && vas13) {
    await prisma.product.update({
      where: { id: glp13.id },
      data: { vasilhameProductId: vas13.id },
    });
  }

  const counts = await seedDemoTransactions({
    orgId: org.id,
    stores: stores.map((store) => ({ id: store.id, code: store.code })),
    attendantByStore,
    delivererIdsByStore,
    customersByStore,
    paymentMethodsByStore,
    productBySku,
    expenseCategoryByName,
  });

  console.log('Seed completed:', {
    org: org.slug,
    stores: stores.map((s) => s.code),
    users: [master.email, manager.email, 'atendente@gas.com', ...delivererUsers],
    password: 'admin123',
    ...counts,
  });
}

interface DemoInput {
  orgId: string;
  stores: { id: string; code: string }[];
  attendantByStore: Map<string, string>;
  delivererIdsByStore: Map<string, string[]>;
  customersByStore: Map<string, string[]>;
  paymentMethodsByStore: Map<
    string,
    { id: string; systemCode: string | null; feeMode: PaymentFeeMode; feePercent: unknown; feeFixed: unknown }[]
  >;
  productBySku: Map<string, { id: string }>;
  expenseCategoryByName: Map<string, string>;
}

/**
 * Massa transacional do primeiro dia do mês passado até hoje — a janela que a tela de
 * resultado abre por padrão (mês corrente) mais um mês fechado para comparação.
 */
async function seedDemoTransactions(input: DemoInput) {
  // Recria do zero: só apaga o que a própria seed gerou.
  await prisma.sale.deleteMany({ where: { id: { startsWith: 'seed-sale-' } } });
  await prisma.expense.deleteMany({ where: { id: { startsWith: 'seed-expense-' } } });
  // Venda de exemplo das versões antigas da seed (id aleatório, cliente `seed-customer-1`).
  await prisma.sale.deleteMany({ where: { customerId: 'seed-customer-1' } });
  await prisma.customer.deleteMany({ where: { id: 'seed-customer-1' } });

  // "Hoje" no fuso das lojas — entre 00h e 03h UTC a data em Brasília ainda é a anterior.
  const now = new Date(Date.now() - DEMO_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
  const today = {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
    day: now.getUTCDate(),
  };
  const previousMonthDate = new Date(Date.UTC(today.year, today.month - 1, 1));
  const previousMonth = {
    year: previousMonthDate.getUTCFullYear(),
    month: previousMonthDate.getUTCMonth(),
  };
  const previousMonthDays = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();

  /** Instante real da execução — separa entrega concluída de entrega ainda em rota. */
  const nowInstant = new Date();

  const sales: Prisma.SaleCreateManyInput[] = [];
  const saleItems: Prisma.SaleItemCreateManyInput[] = [];
  const salePayments: Prisma.SalePaymentCreateManyInput[] = [];
  const statusLogs: Prisma.SaleStatusLogCreateManyInput[] = [];
  const deliveries: Prisma.DeliveryCreateManyInput[] = [];
  /** Faturamento contado por `${storeId}:${current|previous}` — base do orçamento de gastos. */
  const revenueByStoreMonth = new Map<string, number>();

  let saleSeq = 0;

  const days: { year: number; month: number; day: number; isCurrentMonth: boolean }[] = [];
  for (let day = 1; day <= previousMonthDays; day += 1) {
    days.push({ year: previousMonth.year, month: previousMonth.month, day, isCurrentMonth: false });
  }
  for (let day = 1; day <= today.day; day += 1) {
    days.push({ year: today.year, month: today.month, day, isCurrentMonth: true });
  }

  for (const store of input.stores) {
    const profile = STORE_PROFILES.find((item) => item.code === store.code)!;
    const attendantId = input.attendantByStore.get(store.id) ?? null;
    const delivererIds = input.delivererIdsByStore.get(store.id) ?? [];
    const customerIds = input.customersByStore.get(store.id) ?? [];
    const methods = (input.paymentMethodsByStore.get(store.id) ?? [])
      .map((method) => {
        const config = PAYMENT_METHOD_SEEDS.find((seed) => seed.systemCode === method.systemCode);
        return config ? { ...config, id: method.id } : null;
      })
      .filter((method): method is (typeof PAYMENT_METHOD_SEEDS)[number] & { id: string } =>
        method != null && method.weight > 0,
      );

    for (const date of days) {
      // Fim de semana move menos gás; segunda concentra a reposição.
      const weekday = new Date(Date.UTC(date.year, date.month, date.day)).getUTCDay();
      const weekdayFactor = weekday === 0 ? 0.55 : weekday === 6 ? 0.8 : 1;
      const [minSales, maxSales] = profile.salesPerDay;
      const salesToday = Math.max(1, Math.round(randomInt(minSales, maxSales) * weekdayFactor));

      for (let index = 0; index < salesToday; index += 1) {
        saleSeq += 1;
        const saleId = `seed-sale-${String(saleSeq).padStart(5, '0')}`;
        const saleDate = localNoon(date.year, date.month, date.day);
        // Espalha pelo horário comercial; no dia de hoje só para trás, para não
        // gravar venda com hora no futuro.
        const isToday = date.isCurrentMonth && date.day === today.day;
        saleDate.setUTCHours(saleDate.getUTCHours() + randomInt(-4, isToday ? 0 : 6));

        const roll = random();
        // 5% canceladas e 3% aguardando aprovação retroativa: nenhuma delas entra no
        // resultado — servem para conferir que a tela filtra o que não é venda contada.
        const isCancelled = roll < 0.05;
        const isPendingBackdate = !isCancelled && roll < 0.08;
        const isPortaria = !isCancelled && !isPendingBackdate && random() < 0.12;

        const status = isCancelled
          ? SaleStatus.CANCELLED
          : isPortaria
            ? SaleStatus.PORTARIA
            : SaleStatus.DELIVERED;
        const channel = isPortaria
          ? SaleChannel.IN_STORE
          : random() < 0.45
            ? SaleChannel.WHATSAPP
            : random() < 0.7
              ? SaleChannel.PHONE
              : SaleChannel.APP;

        const lineCount = random() < 0.15 ? 2 : 1;
        const usedSkus = new Set<string>();
        let total = 0;
        const pendingItems: Prisma.SaleItemCreateManyInput[] = [];

        for (let line = 0; line < lineCount; line += 1) {
          const mix = pickWeighted(PRODUCT_MIX);
          if (usedSkus.has(mix.sku)) continue;
          usedSkus.add(mix.sku);

          const product = input.productBySku.get(mix.sku)!;
          const pricing = PRODUCT_PRICING[mix.sku][store.code];
          const quantity = randomInt(1, mix.maxQuantity);
          const lineTotal = round2(quantity * pricing.price);
          total = round2(total + lineTotal);

          pendingItems.push({
            id: `seed-item-${String(saleSeq).padStart(5, '0')}-${line}`,
            saleId,
            productId: product.id,
            quantity,
            unitPrice: pricing.price,
            unitCost: pricing.cost,
            total: lineTotal,
          });
        }

        if (total <= 0) continue;
        saleItems.push(...pendingItems);

        const customerId = customerIds.length
          ? customerIds[randomInt(0, customerIds.length - 1)]
          : null;

        // Venda de portaria é retirada no balcão: não gera rota nem entregador. Nas
        // demais, um dos dois entregadores da unidade leva o pedido — o primeiro pega
        // mais rotas, para a tabela de desempenho não sair empatada.
        const routeDelivererId =
          isPortaria || delivererIds.length === 0
            ? null
            : delivererIds[random() < 0.62 ? 0 : delivererIds.length - 1];

        let delivery: Prisma.DeliveryCreateManyInput | null = null;
        if (routeDelivererId) {
          // Espera = da venda até o entregador sair; rota = da saída até entregar.
          // Uma em cada dez passa dos 15 min que o painel destaca como entrega lenta.
          const isSlow = random() < 0.1;
          const waitSeconds = isSlow ? randomInt(960, 2100) : randomInt(90, 780);
          const routeSeconds = isSlow ? randomInt(960, 2400) : randomInt(300, 900);
          const startedAt = new Date(saleDate.getTime() + waitSeconds * 1000);
          const completedAt = new Date(startedAt.getTime() + routeSeconds * 1000);

          // As duas últimas vendas de hoje ficam em rota. Sem isso o painel quase
          // nunca teria entrega ativa: as vendas do dia são geradas pela manhã e a
          // essa altura já estariam todas concluídas.
          const isLastOfToday = isToday && index === salesToday - 1;
          const stillRunning =
            isLastOfToday || (isToday && index === salesToday - 2) || completedAt > nowInstant;
          const waiting = isLastOfToday || startedAt > nowInstant;

          const deliveryStatus = isCancelled
            ? DeliveryStatus.CANCELLED
            : waiting
              ? DeliveryStatus.PENDING
              : stillRunning
                ? DeliveryStatus.IN_PROGRESS
                : DeliveryStatus.DELIVERED;
          const started =
            deliveryStatus === DeliveryStatus.IN_PROGRESS ||
            deliveryStatus === DeliveryStatus.DELIVERED;

          delivery = {
            id: `seed-delivery-${String(saleSeq).padStart(5, '0')}`,
            saleId,
            // Pedido em espera ainda não tem entregador alocado; o cancelado mantém o
            // seu, senão a rota perdida não apareceria na conta de ninguém.
            delivererId: deliveryStatus === DeliveryStatus.PENDING ? null : routeDelivererId,
            status: deliveryStatus,
            startedAt: started ? startedAt : null,
            completedAt: deliveryStatus === DeliveryStatus.DELIVERED ? completedAt : null,
            createdAt: saleDate,
          };
          deliveries.push(delivery);
        }

        sales.push({
          id: saleId,
          storeId: store.id,
          customerId,
          attendantId,
          delivererId: delivery?.delivererId ?? null,
          status,
          channel,
          total,
          saleDate,
          createdAt: saleDate,
          notes: 'seed:demo',
          confirmedAt: isCancelled ? null : saleDate,
          deliveredAt: status === SaleStatus.DELIVERED ? saleDate : null,
          canceledAt: isCancelled ? saleDate : null,
          canceledReason: isCancelled ? 'Cliente desistiu' : null,
          backdateApproval: isPendingBackdate
            ? BackdateApprovalStatus.PENDING
            : BackdateApprovalStatus.NOT_REQUIRED,
          backdateRequestNotes: isPendingBackdate ? 'Lançamento retroativo do dia' : null,
          deliveryStreet: 'Rua das Flores',
          deliveryNumber: String(randomInt(10, 900)),
          deliveryNeighborhood: 'Centro',
          deliveryCity: profile.city,
          deliveryState: 'SP',
        });

        // Mesmo recorte de venda contada que a API usa no resultado.
        if (!isCancelled && !isPendingBackdate) {
          const key = `${store.id}:${date.isCurrentMonth ? 'current' : 'previous'}`;
          revenueByStoreMonth.set(key, round2((revenueByStoreMonth.get(key) ?? 0) + total));
        }

        statusLogs.push({
          id: `seed-log-${String(saleSeq).padStart(5, '0')}-1`,
          saleId,
          userId: attendantId,
          status: isCancelled ? SaleStatus.CANCELLED : status,
          createdAt: saleDate,
        });

        // Pagamento: uma forma na maioria das vendas, duas em 12% delas.
        if (methods.length > 0) {
          const split = random() < 0.12 && total > 100;
          const first = pickWeighted(methods);
          const firstAmount = split ? round2(total * 0.6) : total;
          salePayments.push({
            id: `seed-pay-${String(saleSeq).padStart(5, '0')}-1`,
            saleId,
            method: first.systemCode,
            storePaymentMethodId: first.id,
            amount: firstAmount,
            processingFee: computeProcessingFee(firstAmount, first),
            createdAt: saleDate,
          });

          if (split) {
            const second = pickWeighted(methods);
            const secondAmount = round2(total - firstAmount);
            salePayments.push({
              id: `seed-pay-${String(saleSeq).padStart(5, '0')}-2`,
              saleId,
              method: second.systemCode,
              storePaymentMethodId: second.id,
              amount: secondAmount,
              processingFee: computeProcessingFee(secondAmount, second),
              createdAt: saleDate,
            });
          }
        }
      }
    }
  }

  await prisma.sale.createMany({ data: sales, skipDuplicates: true });
  await prisma.saleItem.createMany({ data: saleItems, skipDuplicates: true });
  await prisma.salePayment.createMany({ data: salePayments, skipDuplicates: true });
  await prisma.saleStatusLog.createMany({ data: statusLogs, skipDuplicates: true });
  // Depois das vendas: a entrega referencia a venda, e some junto com ela no `delete`
  // do começo da seed (`Delivery.sale` é `onDelete: Cascade`).
  await prisma.delivery.createMany({ data: deliveries, skipDuplicates: true });

  // ---- Gastos da empresa -------------------------------------------------------
  const expenses: Prisma.ExpenseCreateManyInput[] = [];
  let expenseSeq = 0;

  const daysInCurrentMonth = new Date(Date.UTC(today.year, today.month + 1, 0)).getUTCDate();
  const months = [
    {
      key: 'previous' as const,
      year: previousMonth.year,
      month: previousMonth.month,
      closed: true,
      daysInMonth: previousMonthDays,
      elapsedDays: previousMonthDays,
    },
    {
      key: 'current' as const,
      year: today.year,
      month: today.month,
      closed: false,
      daysInMonth: daysInCurrentMonth,
      elapsedDays: today.day,
    },
  ];

  for (const store of input.stores) {
    const profile = STORE_PROFILES.find((item) => item.code === store.code)!;
    const budgetRatio = EXPENSE_BUDGET_RATIO[store.code] ?? 0.2;

    for (const month of months) {
      const realizedRevenue = revenueByStoreMonth.get(`${store.id}:${month.key}`) ?? 0;
      if (realizedRevenue <= 0) continue;

      // No mês em curso o orçamento se baseia no faturamento projetado para o mês
      // fechado — é assim que o gasto fixo (aluguel cheio no dia 1) faz sentido
      // contra um faturamento que ainda está sendo realizado.
      const projectedRevenue = realizedRevenue * (month.daysInMonth / month.elapsedDays);
      const budget = projectedRevenue * budgetRatio;
      const elapsedRatio = month.elapsedDays / month.daysInMonth;

      for (const plan of EXPENSE_PLAN) {
        const categoryId = input.expenseCategoryByName.get(plan.category);
        if (!categoryId) continue;

        const day = plan.day === 'month-end' ? month.daysInMonth : plan.day;
        // Competência futura não existe ainda: folha e benefícios do mês corrente só
        // aparecem no fechamento, como no lançamento real.
        if (!month.closed && day > month.elapsedDays) continue;

        // Fixo entra cheio na competência; variável acompanha os dias já corridos.
        const partialFactor = month.closed || !plan.variable ? 1 : elapsedRatio;
        const jitter = 0.95 + random() * 0.1;
        const amount = round2(budget * plan.weight * partialFactor * jitter);
        if (amount <= 0) continue;

        expenseSeq += 1;
        const paid = month.closed || day <= month.elapsedDays - 2;
        expenses.push({
          id: `seed-expense-${String(expenseSeq).padStart(4, '0')}`,
          organizationId: input.orgId,
          storeId: store.id,
          categoryId,
          description: `${plan.category} — ${profile.city}`,
          expenseDate: dateOnly(month.year, month.month, day),
          dueDate: dateOnly(month.year, month.month, Math.min(day + 5, month.daysInMonth)),
          paidAt: paid ? dateOnly(month.year, month.month, day) : null,
          amount,
          status: paid ? ExpenseStatus.PAID : ExpenseStatus.PENDING,
          notes: 'seed:demo',
        });
      }

      // Um gasto cancelado por unidade/mês: não pode aparecer no resultado.
      const cancelledCategory = input.expenseCategoryByName.get('Outros');
      const cancelledDay = Math.min(14, month.elapsedDays);
      if (cancelledCategory && cancelledDay >= 1) {
        expenseSeq += 1;
        expenses.push({
          id: `seed-expense-${String(expenseSeq).padStart(4, '0')}`,
          organizationId: input.orgId,
          storeId: store.id,
          categoryId: cancelledCategory,
          description: `Cobrança indevida estornada — ${profile.city}`,
          expenseDate: dateOnly(month.year, month.month, cancelledDay),
          amount: round2(budget * 0.05),
          status: ExpenseStatus.CANCELLED,
          notes: 'seed:demo',
        });
      }
    }
  }

  await prisma.expense.createMany({ data: expenses, skipDuplicates: true });

  return {
    sales: sales.length,
    saleItems: saleItems.length,
    salePayments: salePayments.length,
    deliveries: deliveries.length,
    expenses: expenses.length,
    periodo: `${previousMonth.year}-${String(previousMonth.month + 1).padStart(2, '0')}-01 → ${today.year}-${String(today.month + 1).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`,
  };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
