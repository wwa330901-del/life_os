import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { MemoryModule } from '../memory/memory.module';
import { CalendarModule } from '../calendar/calendar.module';
import { FinanceModule } from '../finance/finance.module';
import { FinanceReportModule } from '../finance/finance-report.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { TripAiService } from './trip-ai.service';
import { TripReminderService } from './trip-reminder.service';

/** 旅行規劃（2026-10-02）：萬用 AI 用 TripAiService，LINE「旅行」用 TripsService。 */
@Module({
  imports: [UsersModule, KnowledgeModule, MemoryModule, CalendarModule, FinanceModule, FinanceReportModule, LineNotifierModule],
  controllers: [TripsController],
  providers: [TripsService, TripAiService, TripReminderService],
  exports: [TripsService, TripAiService],
})
export class TripsModule {}
