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
})
export class FinanceReportModule {}
