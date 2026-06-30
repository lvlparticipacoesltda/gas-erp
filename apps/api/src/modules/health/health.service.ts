import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyBusinessDayRanges } from '../../common/utils/business-day';

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  async check() {
    let database: 'ok' | 'error' = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }

    const businessDay = verifyBusinessDayRanges();

    return {
      status: database === 'ok' && businessDay.ok ? 'ok' : 'degraded',
      service: 'gas-erp-api',
      database,
      businessDay,
      commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      timestamp: new Date().toISOString(),
    };
  }
}
