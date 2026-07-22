import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { StockModule } from '../stock/stock.module';
import { StoresModule } from '../stores/stores.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GeocodingModule } from '../../common/geocoding/geocoding.module';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [StockModule, StoresModule, NotificationsModule, GeocodingModule],
  controllers: [SalesController],
  providers: [SalesService, AuditService],
  exports: [SalesService],
})
export class SalesModule {}
