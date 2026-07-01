import { Module } from '@nestjs/common';
import { DeliverersService } from './deliverers.service';
import { DeliverersController } from './deliverers.controller';
import { AuditService } from '../../common/audit/audit.service';
import { PushModule } from '../../common/push/push.module';
import { GeocodingModule } from '../../common/geocoding/geocoding.module';

@Module({
  imports: [PushModule, GeocodingModule],
  controllers: [DeliverersController],
  providers: [DeliverersService, AuditService],
  exports: [DeliverersService],
})
export class DeliverersModule {}
