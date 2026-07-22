import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { StockModule } from '../stock/stock.module';
import { StoresModule } from '../stores/stores.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [StockModule, StoresModule, NotificationsModule],
  controllers: [SalesController],
  providers: [SalesService, AuditService],
  exports: [SalesService],
})
export class SalesModule {}
