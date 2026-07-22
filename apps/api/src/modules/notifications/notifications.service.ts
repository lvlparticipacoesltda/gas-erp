import { Injectable } from '@nestjs/common';
import type { Prisma } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '@gas-erp/shared';
import { paginate, paginatedResult } from '../../common/utils/pagination';
import { StoreRealtimeService } from '../../common/realtime/store-realtime.service';

export interface CreateNotificationInput {
  organizationId: string;
  storeId?: string | null;
  type: string;
  title: string;
  body: string;
  saleId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private realtime: StoreRealtimeService,
  ) {}

  /**
   * Cria uma notificação e dispara o evento SSE org (`notification_created`).
   * Best-effort: nunca deve quebrar o fluxo de negócio que a originou.
   */
  async create(input: CreateNotificationInput) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          organizationId: input.organizationId,
          storeId: input.storeId ?? null,
          type: input.type,
          title: input.title,
          body: input.body,
          saleId: input.saleId ?? null,
          metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });

      try {
        this.realtime.notifyStoreChange(
          input.storeId ?? '',
          input.organizationId,
          'notification_created',
        );
      } catch {
        // Realtime não deve bloquear a criação.
      }

      return notification;
    } catch {
      // Persistência de notificação não deve quebrar a venda/cancelamento.
      return null;
    }
  }

  async list(user: AuthUser, page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where: Prisma.NotificationWhereInput = { organizationId: user.organizationId };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { reads: { where: { userId: user.id }, select: { id: true } } },
      }),
      this.prisma.notification.count({ where }),
    ]);

    const mapped = data.map(({ reads, ...notification }) => ({
      ...notification,
      read: reads.length > 0,
    }));

    return paginatedResult(mapped, total, p, ps);
  }

  async unreadCount(user: AuthUser) {
    const count = await this.prisma.notification.count({
      where: {
        organizationId: user.organizationId,
        reads: { none: { userId: user.id } },
      },
    });
    return { count };
  }

  async markRead(user: AuthUser, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!notification) return { ok: true };

    await this.prisma.notificationRead.upsert({
      where: { notificationId_userId: { notificationId: id, userId: user.id } },
      update: {},
      create: { notificationId: id, userId: user.id },
    });
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    const pending = await this.prisma.notification.findMany({
      where: {
        organizationId: user.organizationId,
        reads: { none: { userId: user.id } },
      },
      select: { id: true },
    });
    if (pending.length === 0) return { ok: true, marked: 0 };

    await this.prisma.notificationRead.createMany({
      data: pending.map((n) => ({ notificationId: n.id, userId: user.id })),
      skipDuplicates: true,
    });
    return { ok: true, marked: pending.length };
  }
}
