import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@gas-erp/database';

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 500);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.PRISMA_LOG_QUERIES === 'true'
          ? [{ emit: 'event', level: 'query' }]
          : undefined,
    });

    if (process.env.PRISMA_LOG_QUERIES === 'true') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).$on('query', (event: { duration: number; query: string }) => {
        if (event.duration >= SLOW_QUERY_MS) {
          this.logger.warn(`Slow query ${event.duration}ms: ${event.query.slice(0, 200)}`);
        }
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
