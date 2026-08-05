import { Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { FinanceAccessService } from './finance-access.service';
import { FinanceAccountsController } from './finance-accounts.controller';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceCategoriesController } from './finance-categories.controller';
import { FinanceCategoriesService } from './finance-categories.service';
import { FinanceTransactionsController } from './finance-transactions.controller';
import { FinanceTransactionsService } from './finance-transactions.service';
import { FinanceBudgetsController } from './finance-budgets.controller';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceRecurringTransactionsController } from './finance-recurring-transactions.controller';
import { FinanceRecurringTransactionsService } from './finance-recurring-transactions.service';
import { FinanceLoansController } from './finance-loans.controller';
import { FinanceLoanInvitesController } from './finance-loan-invites.controller';
import { FinanceLoansService } from './finance-loans.service';
import { FinanceAdvancesController } from './finance-advances.controller';
import { FinanceAdvancesService } from './finance-advances.service';

@Module({
  imports: [SpacesModule, LineNotifierModule, ProjectsModule, UsersModule],
  controllers: [
    FinanceAccountsController,
    FinanceCategoriesController,
    FinanceTransactionsController,
    FinanceBudgetsController,
    FinanceRecurringTransactionsController,
    FinanceLoansController,
    FinanceLoanInvitesController,
    FinanceAdvancesController,
  ],
  providers: [
    FinanceAccessService,
    FinanceAccountsService,
    FinanceCategoriesService,
    FinanceTransactionsService,
    FinanceBudgetsService,
    FinanceRecurringTransactionsService,
    FinanceLoansService,
    FinanceAdvancesService,
  ],
  // Reused directly by LineModule so the LINE 財務總覽 command shares the
  // exact same balance/summary logic as the app's own finance screens,
  // instead of a second copy of the derived-balance math drifting out of
  // sync with it.
  exports: [
    FinanceAccountsService,
    FinanceTransactionsService,
    FinanceBudgetsService,
    FinanceLoansService,
    FinanceAdvancesService,
  ],
})
export class FinanceModule {}
