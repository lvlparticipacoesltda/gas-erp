import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from './push.service';

const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class PendingDeliveryReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingDeliveryReminderService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.sendDueReminders().catch((err) => {
        this.logger.warn(
          `Falha ao enviar lembretes de rota pendente: ${err instanceof Error ? err.message : err}`,
        );
      });
    }, REMINDER_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sendDueReminders(): Promise<void> {
    const cutoff = new Date(Date.now() - REMINDER_INTERVAL_MS);

    const pending = await this.prisma.delivery.findMany({
      where: {
        status: 'PENDING',
        delivererId: { not: null },
        deliverer: {
          deliveries: {
            none: { status: 'IN_PROGRESS' },
          },
        },
        OR: [
          { pendingReminderSentAt: null, createdAt: { lte: cutoff } },
          { pendingReminderSentAt: { lte: cutoff } },
        ],
      },
      select: { id: true, delivererId: true },
    });

    for (const delivery of pending) {
      if (!delivery.delivererId) continue;
      const sent = await this.push.notifyPendingDeliveryReminder(
        delivery.delivererId,
        delivery.id,
      );
      if (sent) {
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: { pendingReminderSentAt: new Date() },
        });
      }
    }
  }
}
