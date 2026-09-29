import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { FinanceReportModule } from '../finance/finance-report.module';
import { StocksModule } from '../stocks/stocks.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { UsersModule } from '../users/users.module';
import { LifeGoalsController } from './life-goals.controller';
import { LifeGoalsService } from './life-goals.service';
import { LifeGoalProgressService } from './life-goal-progress.service';
import { LifeGoalReminderService } from './life-goal-reminder.service';
import { LifeGoalAiService } from './life-goal-ai.service';
import { LifeGoalCategoryService } from './life-goal-category.service';

@Module({
  // KnowledgeModule for AiUsageService, UsersModule for the Gemini key (AI 自動分類).
  imports: [FinanceModule, FinanceReportModule, StocksModule, LineNotifierModule, KnowledgeModule, UsersModule],
  controllers: [LifeGoalsController],
  providers: [
    LifeGoalsService,
    LifeGoalProgressService,
    LifeGoalReminderService,
    LifeGoalAiService,
    LifeGoalCategoryService,
  ],
  exports: [LifeGoalsService, LifeGoalProgressService, LifeGoalAiService],
})
export class LifeGoalsModule {}
