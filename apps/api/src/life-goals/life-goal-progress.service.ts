import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { FinanceReportService } from '../finance/finance-report.service';
import { StocksHoldingsService } from '../stocks/stocks-holdings.service';
import {
  FinanceTransactionType,
  LifeGoal,
  LifeGoalTrackingType,
} from '../../generated/prisma/client.js';
import { checkInPeriodStart } from './life-goal-math';

export type LifeGoalWithProgress = LifeGoal & {
  /** Resolved number — the stored value for MANUAL, computed live for every other type. */
  currentValue: number | null;
  trackingAccountName: string | null;
};

/** Resolves every goal's current number from wherever its `trackingType`
 * says it lives. Each shared source (account balances, net worth, holdings)
 * is fetched at most once per call no matter how many goals use it. */
@Injectable()
export class LifeGoalProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: FinanceAccountsService,
    private readonly financeReport: FinanceReportService,
    private readonly stockHoldings: StocksHoldingsService,
  ) {}

  async resolve(userId: string, goals: LifeGoal[]): Promise<LifeGoalWithProgress[]> {
    const types = new Set(goals.map((g) => g.trackingType));
    const needsSpace =
      types.has(LifeGoalTrackingType.ACCOUNT_BALANCE) ||
      types.has(LifeGoalTrackingType.NET_WORTH) ||
      types.has(LifeGoalTrackingType.NOTE_KEYWORD_SUM) ||
      types.has(LifeGoalTrackingType.STOCK_VALUE);
    const space = needsSpace
      ? await this.prisma.space.findUnique({ where: { ownerUserId: userId } })
      : null;

    const accountList = space ? await this.accounts.list(userId, space.id) : [];
    const accountById = new Map(accountList.map((a) => [a.id, a]));

    const netWorth =
      space && types.has(LifeGoalTrackingType.NET_WORTH)
        ? (await this.financeReport.computeNetWorth(userId, space.id)).netWorth
        : null;

    let stockValue: number | null = null;
    if (space && types.has(LifeGoalTrackingType.STOCK_VALUE)) {
      const holdings = await this.stockHoldings.list(userId, space.id);
      stockValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? h.costBasis), 0);
    }

    return Promise.all(
      goals.map(async (goal) => {
        const account = goal.trackingAccountId ? accountById.get(goal.trackingAccountId) : undefined;
        let currentValue: number | null = goal.currentValue;
        switch (goal.trackingType) {
          case LifeGoalTrackingType.ACCOUNT_BALANCE:
            currentValue = account?.balance ?? null;
            break;
          case LifeGoalTrackingType.NET_WORTH:
            currentValue = netWorth;
            break;
          case LifeGoalTrackingType.STOCK_VALUE:
            currentValue = stockValue;
            break;
          case LifeGoalTrackingType.NOTE_KEYWORD_SUM:
            currentValue = space && goal.trackingKeyword ? await this.keywordSum(space.id, goal.trackingKeyword) : null;
            break;
          case LifeGoalTrackingType.CHECK_IN:
            currentValue = await this.checkInSum(goal);
            break;
          case LifeGoalTrackingType.MANUAL:
            break;
        }
        return { ...goal, currentValue, trackingAccountName: account?.name ?? null };
      }),
    );
  }

  /** 備註含關鍵字的「存進去」的錢：收入 + 轉帳（轉進儲蓄帳戶）。支出不扣——
   * 同一個關鍵字常同時出現在「存旅遊基金」跟「旅遊花費」上，扣掉反而讓
   * 存了多少變得看不懂。 */
  private async keywordSum(spaceId: string, keyword: string): Promise<number> {
    const result = await this.prisma.financeTransaction.aggregate({
      where: {
        spaceId,
        type: { in: [FinanceTransactionType.INCOME, FinanceTransactionType.TRANSFER] },
        note: { contains: keyword, mode: 'insensitive' },
      },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  private async checkInSum(goal: LifeGoal): Promise<number> {
    const start = checkInPeriodStart(goal.checkInPeriod);
    const result = await this.prisma.lifeGoalCheckIn.aggregate({
      where: { goalId: goal.id, ...(start && { date: { gte: start } }) },
      _sum: { value: true },
    });
    return result._sum.value ?? 0;
  }
}
