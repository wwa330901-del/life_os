import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { FinanceModule } from '../finance/finance.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { MemoryModule } from '../memory/memory.module';
import { DailyBriefService } from './daily-brief.service';
import { ReminderOverviewController, ReminderOverviewService } from './reminder-overview.service';

@Module({
  imports: [CalendarModule, FinanceModule, LineNotifierModule, MemoryModule],
  controllers: [ReminderOverviewController],
  providers: [DailyBriefService, ReminderOverviewService],
  // LINE「早報」「提醒總覽」隨時查看。
  exports: [DailyBriefService, ReminderOverviewService],
})
export class DailyBriefModule {}
