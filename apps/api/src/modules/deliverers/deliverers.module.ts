import { Module } from '@nestjs/common';
import { DeliverersService } from './deliverers.service';
import { DeliverersController } from './deliverers.controller';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [DeliverersController],
  providers: [DeliverersService, AuditService],
  exports: [DeliverersService],
})
export class DeliverersModule {}
