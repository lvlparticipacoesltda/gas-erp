import { Module } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { StorePaymentMethodsService } from './store-payment-methods.service';
import { StorePaymentMethodsController } from './store-payment-methods.controller';
import { AuditService } from '../../common/audit/audit.service';
import { GeocodingModule } from '../../common/geocoding/geocoding.module';

@Module({
  imports: [GeocodingModule],
  controllers: [StoresController, StorePaymentMethodsController],
  providers: [StoresService, StorePaymentMethodsService, AuditService],
  exports: [StoresService, StorePaymentMethodsService],
})
export class StoresModule {}
