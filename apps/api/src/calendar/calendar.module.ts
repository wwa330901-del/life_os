import { Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { CalendarAccessService } from './calendar-access.service';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarEventsService } from './calendar-events.service';
import { CalendarConnectionController } from './calendar-connection.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarSyncService } from './calendar-sync.service';
import { AppleCalendarConnectionController } from './apple-calendar-connection.controller';
import { AppleCalendarService } from './apple-calendar.service';
import { AppleCalendarSyncService } from './apple-calendar-sync.service';

@Module({
  imports: [SpacesModule],
  controllers: [CalendarEventsController, CalendarConnectionController, AppleCalendarConnectionController],
  providers: [
    CalendarAccessService,
    CalendarEventsService,
    GoogleCalendarService,
    CalendarSyncService,
    AppleCalendarService,
    AppleCalendarSyncService,
  ],
  exports: [CalendarSyncService, GoogleCalendarService, CalendarEventsService],
})
export class CalendarModule {}
