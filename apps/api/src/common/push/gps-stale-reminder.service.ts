import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DELIVERER_GPS_STALE_PUSH_AFTER_MS,
  DELIVERER_GPS_STALE_PUSH_COOLDOWN_MS,
} from '@gas-erp/shared';
import { DeliveryStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from './push.service';

const CHECK_INTERVAL_MS = 60_000;

@Injectable()
export class GpsStaleReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GpsStaleReminderService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.sendDueReminders().catch((err) => {
        this.logger.warn(
          `Falha ao verificar GPS parado: ${err instanceof Error ? err.message : err}`,
        );
      });
    }, CHECK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sendDueReminders(): Promise<void> {
    const now = Date.now();
    const staleCutoff = new Date(now - DELIVERER_GPS_STALE_PUSH_AFTER_MS);
    const cooldownCutoff = new Date(now - DELIVERER_GPS_STALE_PUSH_COOLDOWN_MS);

    const deliverers = await this.prisma.deliverer.findMany({
      where: {
        expoPushToken: { not: null },
        lastSeenAt: { not: null, lte: staleCutoff },
        AND: [
          {
            OR: [
              { gpsStaleReminderSentAt: null },
              { gpsStaleReminderSentAt: { lte: cooldownCutoff } },
            ],
          },
          {
            OR: [
              { status: { not: 'OFFLINE' } },
              { deliveries: { some: { status: DeliveryStatus.IN_PROGRESS } } },
            ],
          },
        ],
      },
      select: { id: true },
    });

    for (const { id } of deliverers) {
      const sent = await this.push.notifyGpsStale(id);
      if (sent) {
        await this.prisma.deliverer.update({
          where: { id },
          data: { gpsStaleReminderSentAt: new Date() },
        });
      }
    }
  }
}
