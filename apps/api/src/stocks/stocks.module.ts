import { Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { FinanceModule } from '../finance/finance.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { StocksAccessService } from './stocks-access.service';
import { StocksTransactionsController } from './stocks-transactions.controller';
import { StocksTransactionsService } from './stocks-transactions.service';
import { StocksHoldingsController } from './stocks-holdings.controller';
import { StocksHoldingsService } from './stocks-holdings.service';
import { StocksRecurringController } from './stocks-recurring.controller';
import { StocksRecurringService } from './stocks-recurring.service';
import { StocksPriceService } from './stocks-price.service';
import { StocksSettlementService } from './stocks-settlement.service';

@Module({
  imports: [SpacesModule, FinanceModule, LineNotifierModule],
  controllers: [StocksTransactionsController, StocksHoldingsController, StocksRecurringController],
  providers: [
    StocksAccessService,
    StocksTransactionsService,
    StocksHoldingsService,
    StocksRecurringService,
    StocksPriceService,
    StocksSettlementService,
  ],
  // Reused directly by LineModule for 股票買賣／持股總攬／定期定額回覆 commands.
  exports: [StocksTransactionsService, StocksHoldingsService, StocksRecurringService],
})
export class StocksModule {}
