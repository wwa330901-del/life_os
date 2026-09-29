import { Module } from '@nestjs/common';
import { FinanceModule } from './finance.module';
import { StocksModule } from '../stocks/stocks.module';
import { FinanceReportService } from './finance-report.service';
import { FinanceReportController } from './finance-report.controller';

/// Split out from FinanceModule (rather than added to it) specifically to
/// avoid a circular import — StocksModule already imports FinanceModule
/// (needs FinanceAccountsService for stock trade settlement), and this
/// report needs StocksHoldingsService, so it has to sit above both instead
/// of living inside either one.
@Module({
  imports: [FinanceModule, StocksModule],
  controllers: [FinanceReportController],
  providers: [FinanceReportService],
  // 人生目標的「淨資產」追蹤用同一套算法，不另寫一份。
  exports: [FinanceReportService],
})
export class FinanceReportModule {}
