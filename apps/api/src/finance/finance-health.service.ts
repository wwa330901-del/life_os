import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceTransactionsService } from './finance-transactions.service';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceReportService } from './finance-report.service';
import { StocksHoldingsService } from '../stocks/stocks-holdings.service';
import { taipeiCurrentMonth, taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';
import { FinanceAccountType } from '../../generated/prisma/client.js';
import { computeFinanceHealth, HealthResult } from './finance-health';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface FinanceHealthReport extends HealthResult {
  monthlyIncome: number;
  monthlyExpense: number;
  netWorth: number;
}

/** Gathers the user's real numbers for `computeFinanceHealth` — reuses the
 * existing account/report/budget/holding services, no new data source. */
@Injectable()
export class FinanceHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: FinanceAccountsService,
    private readonly transactions: FinanceTransactionsService,
    private readonly budgets: FinanceBudgetsService,
    private readonly report: FinanceReportService,
    private readonly holdings: StocksHoldingsService,
  ) {}

  async forUser(userId: string): Promise<FinanceHealthReport | null> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    return space ? this.forSpace(userId, space.id) : null;
  }

  async forSpace(userId: string, spaceId: string): Promise<FinanceHealthReport> {
    const currentMonth = taipeiCurrentMonth();
    const lastThree = [1, 2, 3].map((d) => shiftMonth(currentMonth, -d));
    const since30 = taipeiDateKeyToUtcMidnight(taipeiDateKey(new Date(Date.now() - 30 * MS_PER_DAY)));

    const [summaries, accounts, netWorth, budgetStatus, holdings, recordedDays] = await Promise.all([
      Promise.all(lastThree.map((m) => this.transactions.monthlySummary(userId, spaceId, m))),
      this.accounts.list(userId, spaceId),
      this.report.computeNetWorth(userId, spaceId),
      this.budgets.monthlyStatus(userId, spaceId, lastThree[0]),
      this.holdings.list(userId, spaceId),
      this.prisma.financeTransaction.findMany({
        where: { spaceId, date: { gte: since30 } },
        distinct: ['date'],
        select: { date: true },
      }),
    ]);

    const income3m = summaries.reduce((sum, s) => sum + s.totalIncome, 0);
    const expense3m = summaries.reduce((sum, s) => sum + s.totalExpense, 0);
    const liquid = accounts
      .filter((a) => a.type === FinanceAccountType.CASH || a.type === FinanceAccountType.BANK)
      .reduce((sum, a) => sum + Math.max(0, a.balance), 0);
    const cardDebt = accounts
      .filter((a) => a.type === FinanceAccountType.CREDIT_CARD && a.balance < 0)
      .reduce((sum, a) => sum - a.balance, 0);
    const holdingValues = holdings.map((h) => h.marketValue ?? h.costBasis);

    const result = computeFinanceHealth({
      income3m,
      expense3m,
      liquid,
      totalAssets: netWorth.totalAssets + cardDebt, // computeNetWorth nets card debt into assets
      debt: netWorth.totalLiabilities + cardDebt,
      netWorth: netWorth.netWorth,
      budgetCount: budgetStatus.length,
      budgetsWithin: budgetStatus.filter((b) => b.spent <= b.monthlyAmount).length,
      investedValue: holdingValues.reduce((a, b) => a + b, 0),
      largestHolding: holdingValues.length > 0 ? Math.max(...holdingValues) : 0,
      recordedDays30: recordedDays.length,
    });
    return { ...result, monthlyIncome: income3m / 3, monthlyExpense: expense3m / 3, netWorth: netWorth.netWorth };
  }
}

export function formatFinanceHealth(r: FinanceHealthReport): string {
  const lines = [`🩺 財務健檢：${r.total} 分（${r.grade}）`, ''];
  for (const item of r.items) {
    lines.push(`${item.score >= item.max ? '✅' : '▫️'} ${item.label} ${item.score}/${item.max}　${item.detail}`);
    if (item.tip) lines.push(`　→ ${item.tip}`);
  }
  lines.push('', '想要具體規劃，直接問我「幫我做財務規劃」或「一年存 50 萬每月要存多少」');
  return lines.join('\n');
}
