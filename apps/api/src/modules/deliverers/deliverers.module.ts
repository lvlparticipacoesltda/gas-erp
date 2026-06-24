import { Module } from '@nestjs/common';
import { DeliverersService } from './deliverers.service';
import { DeliverersController } from './deliverers.controller';

@Module({
  controllers: [DeliverersController],
  providers: [DeliverersService],
  exports: [DeliverersService],
})
export class DeliverersModule {}
