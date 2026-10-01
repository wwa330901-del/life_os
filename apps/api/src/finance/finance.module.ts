import { Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { UsersModule } from '../users/users.module';
import { FriendsModule } from '../friends/friends.module';
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
import { CreditCardService } from './credit-card.service';
import { LoanDueReminderService } from './loan-due-reminder.service';

@Module({
  imports: [SpacesModule, LineNotifierModule, UsersModule, FriendsModule],
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
    CreditCardService,
    LoanDueReminderService,
  ],
  // Reused directly by LineModule so the LINE 財務總覽 command shares the
  // exact same balance/summary logic as the app's own finance screens,
  // instead of a second copy of the derived-balance math drifting out of
  // sync with it.
  exports: [
    FinanceAccessService,
    FinanceAccountsService,
    FinanceCategoriesService,
    FinanceTransactionsService,
    FinanceBudgetsService,
    FinanceLoansService,
    FinanceAdvancesService,
    // 理財評估：固定薪資＝每月定期收入。
    FinanceRecurringTransactionsService,
    // 信用卡繳款：AI 查帳單、繳卡費。
    CreditCardService,
  ],
})
export class FinanceModule {}
