import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { FriendsModule } from '../friends/friends.module';
import { CalendarSharesService } from './calendar-shares.service';
import { CalendarSharesController } from './calendar-shares.controller';

@Module({
  imports: [CalendarModule, FriendsModule],
  controllers: [CalendarSharesController],
  providers: [CalendarSharesService],
  exports: [CalendarSharesService],
})
export class CalendarSharesModule {}
