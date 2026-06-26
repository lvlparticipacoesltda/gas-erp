import { Module } from '@nestjs/common';
import { DeliverersService } from './deliverers.service';
import { DeliverersController } from './deliverers.controller';
import { AuditService } from '../../common/audit/audit.service';
import { PushModule } from '../../common/push/push.module';

@Module({
  imports: [PushModule],
  controllers: [DeliverersController],
  providers: [DeliverersService, AuditService],
  exports: [DeliverersService],
})
export class DeliverersModule {}
