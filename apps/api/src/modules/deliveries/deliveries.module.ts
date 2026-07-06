import { Module } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { GeocodingModule } from '../../common/geocoding/geocoding.module';
import { RoutingModule } from '../../common/routing/routing.module';

@Module({
  imports: [GeocodingModule, RoutingModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
