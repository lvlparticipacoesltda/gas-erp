import { Module } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { StockModule } from '../stock/stock.module';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [StockModule],
  controllers: [PurchaseInvoicesController],
  providers: [PurchaseInvoicesService, AuditService],
  exports: [PurchaseInvoicesService],
})
export class PurchaseInvoicesModule {}
