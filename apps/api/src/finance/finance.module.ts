import { Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { FinanceAccessService } from './finance-access.service';
import { FinanceAccountsController } from './finance-accounts.controller';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceCategoriesController } from './finance-categories.controller';
import { FinanceCategoriesService } from './finance-categories.service';
import { FinanceTransactionsController } from './finance-transactions.controller';
import { FinanceTransactionsService } from './finance-transactions.service';
import { FinanceBudgetsController } from './finance-budgets.controller';
import { FinanceBudgetsService } from './finance-budgets.service';

@Module({
  imports: [SpacesModule],
  controllers: [
    FinanceAccountsController,
    FinanceCategoriesController,
    FinanceTransactionsController,
    FinanceBudgetsController,
  ],
  providers: [
    FinanceAccessService,
    FinanceAccountsService,
    FinanceCategoriesService,
    FinanceTransactionsService,
    FinanceBudgetsService,
  ],
  // Reused directly by LineModule so the LINE 財務總覽 command shares the
  // exact same balance/summary logic as the app's own finance screens,
  // instead of a second copy of the derived-balance math drifting out of
  // sync with it.
  exports: [FinanceAccountsService, FinanceTransactionsService],
})
export class FinanceModule {}
