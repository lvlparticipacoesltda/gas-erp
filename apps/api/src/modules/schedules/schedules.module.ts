import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { CnpjLookupModule } from '../../common/cnpj/cnpj-lookup.module';

@Module({
  imports: [CnpjLookupModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
