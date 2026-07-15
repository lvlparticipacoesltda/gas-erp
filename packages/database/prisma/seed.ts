import bcrypt from 'bcryptjs';
import {
  DelivererStatus,
  PaymentMethod,
  PrismaClient,
  SaleChannel,
  SaleStatus,
  UserRole,
} from '@prisma/client';

const prisma = new PrismaClient();

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

  const stores = await Promise.all([
    prisma.store.upsert({
      where: { organizationId_code: { organizationId: org.id, code: 'SV' } },
      update: {},
      create: {
        organizationId: org.id,
        name: 'Unidade São Vicente',
        code: 'SV',
        city: 'São Vicente',
        state: 'SP',
        address: 'Av. Principal, 100',
      },
    }),
    prisma.store.upsert({
      where: { organizationId_code: { organizationId: org.id, code: 'STS' } },
      update: {},
      create: {
        organizationId: org.id,
        name: 'Unidade Santos',
        code: 'STS',
        city: 'Santos',
        state: 'SP',
        address: 'Rua do Comércio, 200',
      },
    }),
    prisma.store.upsert({
      where: { organizationId_code: { organizationId: org.id, code: 'PG' } },
      update: {},
      create: {
        organizationId: org.id,
        name: 'Unidade Praia Grande',
        code: 'PG',
        city: 'Praia Grande',
        state: 'SP',
        address: 'Av. da Praia, 300',
      },
    }),
  ]);

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

  const attendant = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'atendente@gas.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'atendente@gas.com',
      passwordHash,
      name: 'Atendente São Vicente',
      role: UserRole.ATTENDANT,
      userStores: { create: { storeId: stores[0].id } },
    },
  });

  const delivererUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'entregador@gas.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'entregador@gas.com',
      passwordHash,
      name: 'João Entregador',
      role: UserRole.DELIVERER,
      userStores: { create: { storeId: stores[0].id } },
    },
  });

  const deliverer = await prisma.deliverer.upsert({
    where: { userId: delivererUser.id },
    update: {
      availableStoreId: stores[0].id,
    },
    create: {
      userId: delivererUser.id,
      status: DelivererStatus.AVAILABLE,
      availableStoreId: stores[0].id,
    },
  });

  await prisma.delivererStore.upsert({
    where: { delivererId_storeId: { delivererId: deliverer.id, storeId: stores[0].id } },
    update: {},
    create: { delivererId: deliverer.id, storeId: stores[0].id },
  });

  const category = await prisma.customerCategory.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Residencial' } },
    update: {},
    create: { organizationId: org.id, name: 'Residencial' },
  });

  const customer = await prisma.customer.upsert({
    where: { id: 'seed-customer-1' },
    update: {},
    create: {
      id: 'seed-customer-1',
      organizationId: org.id,
      storeId: stores[0].id,
      categoryId: category.id,
      name: 'Maria Silva',
      phone: '13999990001',
      document: '123.456.789-00',
      addresses: {
        create: {
          label: 'Casa',
          street: 'Rua das Flores',
          number: '123',
          neighborhood: 'Centro',
          city: 'São Vicente',
          state: 'SP',
          isDefault: true,
        },
      },
    },
  });

  const products = await Promise.all(
    [
      { sku: 'GLP-P13', name: 'GLP 13KG', productType: 'GLP', price: 120 },
      { sku: 'GLP-P20', name: 'GLP 20KG', productType: 'GLP', price: 180 },
      { sku: 'GLP-P45', name: 'GLP 45KG', productType: 'GLP', price: 350 },
      { sku: 'VAS-P13', name: 'Vasilhame 13KG', productType: 'CANISTER', price: 0 },
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

      for (const store of stores) {
        await prisma.productStoreSetting.upsert({
          where: { productId_storeId: { productId: product.id, storeId: store.id } },
          update: { price: p.price },
          create: { productId: product.id, storeId: store.id, price: p.price },
        });
        await prisma.stockBalance.upsert({
          where: { productId_storeId: { productId: product.id, storeId: store.id } },
          update: {},
          create: {
            productId: product.id,
            storeId: store.id,
            available: store.code === 'SV' ? 100 : 50,
          },
        });
      }
      return product;
    }),
  );

  const sale = await prisma.sale.create({
    data: {
      storeId: stores[0].id,
      customerId: customer.id,
      attendantId: attendant.id,
      status: SaleStatus.DELIVERED,
      channel: SaleChannel.PHONE,
      total: 120,
      deliveryStreet: 'Rua das Flores',
      deliveryNumber: '123',
      deliveryNeighborhood: 'Centro',
      deliveryCity: 'São Vicente',
      deliveryState: 'SP',
      confirmedAt: new Date(),
      deliveredAt: new Date(),
      items: {
        create: {
          productId: products[0].id,
          quantity: 1,
          unitPrice: 120,
          total: 120,
        },
      },
      payments: {
        create: { method: PaymentMethod.PIX, amount: 120 },
      },
      statusLogs: {
        create: [
          { status: SaleStatus.CONFIRMED, userId: attendant.id },
          { status: SaleStatus.DELIVERED, userId: attendant.id },
        ],
      },
    },
  });

  console.log('Seed completed:', {
    org: org.slug,
    stores: stores.map((s) => s.code),
    users: [master.email, manager.email, attendant.email, delivererUser.email],
    sampleSale: sale.id,
    password: 'admin123',
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
