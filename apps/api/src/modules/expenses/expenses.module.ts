import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, AuditService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
