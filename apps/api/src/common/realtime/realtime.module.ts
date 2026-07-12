import { Global, Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { StoreRealtimeService } from './store-realtime.service';

@Global()
@Module({
  controllers: [RealtimeController],
  providers: [StoreRealtimeService],
  exports: [StoreRealtimeService],
})
export class RealtimeModule {}
