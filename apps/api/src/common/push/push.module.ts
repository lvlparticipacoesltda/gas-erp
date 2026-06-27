import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PendingDeliveryReminderService } from './pending-delivery-reminder.service';

@Global()
@Module({
  providers: [PushService, PendingDeliveryReminderService],
  exports: [PushService],
})
export class PushModule {}
