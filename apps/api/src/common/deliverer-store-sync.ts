import { DelivererStatus, PrismaClient } from '@gas-erp/database';

type PrismaLike = Pick<PrismaClient, 'deliverer' | 'delivererStore' | 'userStore'>;

/** Mantém DelivererStore alinhado às lojas do usuário entregador. */
export async function syncDelivererStoresForUser(
  prisma: PrismaLike,
  userId: string,
  storeIds: string[],
) {
  const uniqueStoreIds = [...new Set(storeIds)];
  let deliverer = await prisma.deliverer.findUnique({ where: { userId } });

  if (!deliverer) {
    deliverer = await prisma.deliverer.create({
      data: { userId, status: DelivererStatus.AVAILABLE },
    });
  }

  await prisma.delivererStore.deleteMany({ where: { delivererId: deliverer.id } });

  if (uniqueStoreIds.length > 0) {
    await prisma.delivererStore.createMany({
      data: uniqueStoreIds.map((storeId) => ({ delivererId: deliverer!.id, storeId })),
    });
  }
}

/** Mantém UserStore alinhado às unidades atendidas pelo entregador. */
export async function syncUserStoresForDeliverer(
  prisma: PrismaLike,
  userId: string,
  storeIds: string[],
) {
  const uniqueStoreIds = [...new Set(storeIds)];

  await prisma.userStore.deleteMany({ where: { userId } });

  if (uniqueStoreIds.length > 0) {
    await prisma.userStore.createMany({
      data: uniqueStoreIds.map((storeId) => ({ userId, storeId })),
    });
  }
}
