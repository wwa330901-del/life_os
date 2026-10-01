import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CalendarModule } from '../calendar/calendar.module';
import { LifeGoalsModule } from '../life-goals/life-goals.module';
import { StocksModule } from '../stocks/stocks.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { JournalModule } from '../journal/journal.module';
import { FinanceReportModule } from '../finance/finance-report.module';
import { HealthModule } from '../health/health.module';
import { LifeReviewService } from './life-review.service';

@Module({
  imports: [FinanceModule, CalendarModule, LifeGoalsModule, StocksModule, LineNotifierModule, KnowledgeModule, JournalModule, FinanceReportModule, HealthModule],
  providers: [LifeReviewService],
  // LINE「週回顧」「月回顧」與萬用 AI 也會用到。
  exports: [LifeReviewService],
})
export class LifeReviewModule {}
