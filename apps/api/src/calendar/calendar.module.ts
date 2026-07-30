import { Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { CalendarAccessService } from './calendar-access.service';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarEventsService } from './calendar-events.service';
import { CalendarConnectionController } from './calendar-connection.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
  imports: [SpacesModule],
  controllers: [CalendarEventsController, CalendarConnectionController],
  providers: [CalendarAccessService, CalendarEventsService, GoogleCalendarService, CalendarSyncService],
  exports: [CalendarSyncService, GoogleCalendarService, CalendarEventsService],
})
export class CalendarModule {}
