import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { FinanceReportModule } from '../finance/finance-report.module';
import { StocksModule } from '../stocks/stocks.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { LifeGoalsController } from './life-goals.controller';
import { LifeGoalsService } from './life-goals.service';
import { LifeGoalProgressService } from './life-goal-progress.service';
import { LifeGoalReminderService } from './life-goal-reminder.service';
import { LifeGoalAiService } from './life-goal-ai.service';

@Module({
  // KnowledgeModule only for AiUsageService (shared AI usage log).
  imports: [FinanceModule, FinanceReportModule, StocksModule, KnowledgeModule, LineNotifierModule],
  controllers: [LifeGoalsController],
  providers: [LifeGoalsService, LifeGoalProgressService, LifeGoalReminderService, LifeGoalAiService],
  exports: [LifeGoalsService, LifeGoalProgressService, LifeGoalAiService],
})
export class LifeGoalsModule {}
