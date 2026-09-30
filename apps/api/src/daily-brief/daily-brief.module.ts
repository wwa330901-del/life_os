import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { FinanceModule } from '../finance/finance.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { DailyBriefService } from './daily-brief.service';

@Module({
  imports: [CalendarModule, FinanceModule, LineNotifierModule],
  providers: [DailyBriefService],
  // LINE「早報」隨時查看。
  exports: [DailyBriefService],
})
export class DailyBriefModule {}
