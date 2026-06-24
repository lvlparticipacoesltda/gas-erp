import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '@gas-erp/shared';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    user: AuthUser,
    action: string,
    entity: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action,
        entity,
        entityId,
        metadata: metadata as object | undefined,
      },
    });
  }
}
