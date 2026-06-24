import { Module } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [StoresController],
  providers: [StoresService, AuditService],
  exports: [StoresService],
})
export class StoresModule {}
