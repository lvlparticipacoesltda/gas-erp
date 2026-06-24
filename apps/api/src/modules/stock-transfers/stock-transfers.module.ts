import { Module } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { StockTransfersController } from './stock-transfers.controller';
import { StockModule } from '../stock/stock.module';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [StockModule],
  controllers: [StockTransfersController],
  providers: [StockTransfersService, AuditService],
})
export class StockTransfersModule {}
