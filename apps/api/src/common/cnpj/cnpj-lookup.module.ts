import { Module } from '@nestjs/common';
import { CnpjLookupService } from './cnpj-lookup.service';

@Module({
  providers: [CnpjLookupService],
  exports: [CnpjLookupService],
})
export class CnpjLookupModule {}
