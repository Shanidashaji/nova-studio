import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [ActivityService, NotificationsService],
  exports: [ActivityService, NotificationsService],
})
export class ActivityModule {}
