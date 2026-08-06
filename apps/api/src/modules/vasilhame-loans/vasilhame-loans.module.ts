import { Module } from '@nestjs/common';
import { VasilhameLoansController } from './vasilhame-loans.controller';
import { VasilhameLoansService } from './vasilhame-loans.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [VasilhameLoansController],
  providers: [VasilhameLoansService, AuditService],
  exports: [VasilhameLoansService],
})
export class VasilhameLoansModule {}
