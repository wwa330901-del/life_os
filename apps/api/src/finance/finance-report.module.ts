import { Module } from '@nestjs/common';
import { FinanceModule } from './finance.module';
import { StocksModule } from '../stocks/stocks.module';
import { FinanceReportService } from './finance-report.service';
import { FinanceReportController } from './finance-report.controller';
import { FinanceHealthService } from './finance-health.service';
import { FinancePlanService } from './finance-plan.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';

/// Split out from FinanceModule (rather than added to it) specifically to
/// avoid a circular import — StocksModule already imports FinanceModule
/// (needs FinanceAccountsService for stock trade settlement), and this
/// report needs StocksHoldingsService, so it has to sit above both instead
/// of living inside either one.
@Module({
  // KnowledgeModule for AiUsageService（理財評估用 AI）。
  imports: [FinanceModule, StocksModule, KnowledgeModule],
  controllers: [FinanceReportController],
  providers: [FinanceReportService, FinanceHealthService, FinancePlanService],
  // 人生目標的「淨資產」追蹤用同一套算法，不另寫一份。
  exports: [FinanceReportService, FinanceHealthService, FinancePlanService],
})
export class FinanceReportModule {}
