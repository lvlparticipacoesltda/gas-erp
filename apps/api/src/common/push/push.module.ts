import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PendingDeliveryReminderService } from './pending-delivery-reminder.service';
import { GpsStaleReminderService } from './gps-stale-reminder.service';

@Global()
@Module({
  providers: [PushService, PendingDeliveryReminderService, GpsStaleReminderService],
  exports: [PushService],
})
export class PushModule {}
