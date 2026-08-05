import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CalendarSharesService } from './calendar-shares.service';
import { CalendarSharesController } from './calendar-shares.controller';

@Module({
  imports: [UsersModule],
  controllers: [CalendarSharesController],
  providers: [CalendarSharesService],
  exports: [CalendarSharesService],
})
export class CalendarSharesModule {}
