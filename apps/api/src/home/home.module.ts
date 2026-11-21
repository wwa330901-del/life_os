import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { StocksModule } from '../stocks/stocks.module';
import { LifeGoalsModule } from '../life-goals/life-goals.module';
import { FinanceReportModule } from '../finance/finance-report.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [FinanceModule, FinanceReportModule, StocksModule, LifeGoalsModule],
  controllers: [HomeController],
  providers: [HomeService],
  exports: [HomeService],
})
export class HomeModule {}
