import {
  getBusinessDayBounds,
  resolveDelivererTimeClockStatus,
  resolveTimeClockSlotTimes,
  todayDateKey,
  type DelivererTimeClockStatus,
} from '@gas-erp/shared';
import type { PrismaService } from '../../prisma/prisma.service';

const BR_TZ = 'America/Sao_Paulo';

/**
 * Situação do cartão de ponto do dia dos entregadores informados, na unidade.
 *
 * Usado para travar o recebimento de rotas: quem não bateu ENT.1 (ou saiu para o
 * almoço sem bater ENT.2) não entra na fila de entregas. As batidas são lidas do
 * dia operacional (America/Sao_Paulo) e da própria unidade, que é onde o
 * entregador bate ponto pelo app.
 */
export async function getDelivererTimeClockStatuses(
  prisma: PrismaService,
  userIds: string[],
  storeId: string,
): Promise<Map<string, DelivererTimeClockStatus>> {
  const result = new Map<string, DelivererTimeClockStatus>();
  if (userIds.length === 0) return result;

  const { start, end } = getBusinessDayBounds(todayDateKey(BR_TZ), BR_TZ);
  const punches = await prisma.timeClockPunch.findMany({
    where: {
      storeId,
      userId: { in: userIds },
      punchedAt: { gte: start, lt: end },
    },
    orderBy: { punchedAt: 'asc' },
    select: { userId: true, type: true, punchedAt: true, slot: true },
  });

  const byUser = new Map<string, typeof punches>();
  for (const punch of punches) {
    const list = byUser.get(punch.userId) ?? [];
    list.push(punch);
    byUser.set(punch.userId, list);
  }

  for (const userId of userIds) {
    const slots = resolveTimeClockSlotTimes(byUser.get(userId) ?? []);
    result.set(userId, resolveDelivererTimeClockStatus(slots));
  }
  return result;
}

/** Atalho para um único entregador. */
export async function getDelivererTimeClockStatus(
  prisma: PrismaService,
  userId: string,
  storeId: string,
): Promise<DelivererTimeClockStatus> {
  const statuses = await getDelivererTimeClockStatuses(prisma, [userId], storeId);
  return statuses.get(userId) ?? 'NOT_CLOCKED_IN';
}
