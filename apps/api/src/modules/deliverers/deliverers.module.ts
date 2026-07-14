import { Module } from '@nestjs/common';
import { DeliverersService } from './deliverers.service';
import { DeliverersController } from './deliverers.controller';
import { AuditService } from '../../common/audit/audit.service';
import { PushModule } from '../../common/push/push.module';
import { GeocodingModule } from '../../common/geocoding/geocoding.module';
import { RoutingModule } from '../../common/routing/routing.module';

@Module({
  imports: [PushModule, GeocodingModule, RoutingModule],
  controllers: [DeliverersController],
  providers: [DeliverersService, AuditService],
  exports: [DeliverersService],
})
export class DeliverersModule {}
