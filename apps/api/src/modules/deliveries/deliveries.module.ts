import { Module } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { GeocodingModule } from '../../common/geocoding/geocoding.module';
import { RoutingModule } from '../../common/routing/routing.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [GeocodingModule, RoutingModule, StockModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
