import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceTransactionsService } from './finance-transactions.service';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceLoansService } from './finance-loans.service';
import { FinanceAdvancesService } from './finance-advances.service';
import { StocksHoldingsService } from '../stocks/stocks-holdings.service';
import { FinanceLoanDirection, FinanceTransactionType } from '../../generated/prisma/client.js';
import { taipeiCurrentMonth, taipeiDateKey, taipeiDateKeyToUtcMidnight, utcDateKey } from '../common/taipei-date';

const NET_WORTH_TREND_DAYS = 90;
const TOP_EXPENSES_COUNT = 10;
const CATEGORY_TREND_MONTHS = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 財務分析報表 (2026-08-06) — one aggregation point pulling together every
 * existing personal-finance data source (accounts, transactions, budgets,
 * loans/advances, stock holdings) instead of duplicating any of their own
 * query logic; the only genuinely NEW data this owns is `netWorthTrend`
 * (see `FinanceNetWorthSnapshot`'s schema doc comment for why that has to
 * be a daily-accruing snapshot rather than something computed on demand). */
@Injectable()
export class FinanceReportService {
  private readonly logger = new Logger(FinanceReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
    private readonly accounts: FinanceAccountsService,
    private readonly transactions: FinanceTransactionsService,
    private readonly budgets: FinanceBudgetsService,
    private readonly loans: FinanceLoansService,
    private readonly advances: FinanceAdvancesService,
    private readonly stockHoldings: StocksHoldingsService,
  ) {}

  async getReport(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);

    const currentMonth = taipeiCurrentMonth();
    const [netWorth, savingsRate, categoryBreakdown, categoryTrend, portfolio, overspend, debts, topExpenses] =
      await Promise.all([
        this.netWorth(userId, spaceId),
        this.savingsRate(userId, spaceId, currentMonth),
        this.categoryBreakdown(userId, spaceId, currentMonth),
        this.categoryTrend(userId, spaceId),
        this.portfolio(spaceId),
        this.overspendSummary(userId, spaceId, currentMonth),
        this.debtSummary(userId, spaceId),
        this.topExpenses(userId, spaceId, currentMonth),
      ]);

    return { netWorth, savingsRate, categoryBreakdown, categoryTrend, portfolio, overspend, debts, topExpenses };
  }

  /** 每天固定時間跑一次，幫每個有記帳資料的個人空間存一筆今天的淨資產快照
   * ——`getReport`本身也會自我修復補today（見下），這個 cron 是給沒開 App
   * 的日子也不漏拍。 */
  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: 'Asia/Taipei' })
  async snapshotAllSpaces(): Promise<void> {
    const spaceIds = await this.prisma.financeAccount
      .findMany({ select: { spaceId: true }, distinct: ['spaceId'] })
      .then((rows) => rows.map((r) => r.spaceId));
    for (const spaceId of spaceIds) {
      try {
        await this.snapshotSpace(spaceId);
      } catch (error) {
        this.logger.error(`淨資產快照失敗 space=${spaceId}`, error as Error);
      }
    }
  }

  private async netWorth(userId: string, spaceId: string) {
    await this.snapshotSpace(spaceId); // self-heal: ensure today's row exists before reading the trend
    const fromKey = taipeiDateKey(new Date(Date.now() - NET_WORTH_TREND_DAYS * MS_PER_DAY));
    const rows = await this.prisma.financeNetWorthSnapshot.findMany({
      where: { spaceId, date: { gte: taipeiDateKeyToUtcMidnight(fromKey) } },
      orderBy: { date: 'asc' },
    });
    const latest = rows[rows.length - 1];
    return {
      current: latest
        ? { totalAssets: latest.totalAssets, totalLiabilities: latest.totalLiabilities, netWorth: latest.netWorth }
        : { totalAssets: 0, totalLiabilities: 0, netWorth: 0 },
      trend: rows.map((r) => ({
        date: utcDateKey(r.date),
        netWorth: r.netWorth,
        totalAssets: r.totalAssets,
        totalLiabilities: r.totalLiabilities,
      })),
    };
  }

  /** 總資產 = 帳戶餘額加總 + 持股市值加總 + 我借出去／代墊出去還沒收回的
   * 金額；總負債 = 我借入還沒還清的金額。市值抓不到的持股（沒有報價）用
   * 成本代替，避免整個總資產因為單一檔缺報價就整包不算。 */
  private async computeNetWorth(
    userId: string,
    spaceId: string,
  ): Promise<{ totalAssets: number; totalLiabilities: number; netWorth: number }> {
    const [accounts, holdings, loanItems, advanceItems] = await Promise.all([
      this.accounts.list(userId, spaceId),
      this.stockHoldings.list(userId, spaceId),
      this.loans.list(userId, spaceId, { settled: false }),
      this.advances.list(userId, spaceId, { settled: false }),
    ]);

    const accountsTotal = accounts.reduce((sum, a) => sum + a.balance, 0);
    const holdingsTotal = holdings.reduce((sum, h) => sum + (h.marketValue ?? h.costBasis), 0);
    const lentOutstanding = loanItems.items
      .filter((l) => l.direction === FinanceLoanDirection.LEND)
      .reduce((sum, l) => sum + l.outstanding, 0);
    const advancesOutstanding = advanceItems.items.reduce((sum, a) => sum + a.outstanding, 0);
    const borrowedOutstanding = loanItems.items
      .filter((l) => l.direction === FinanceLoanDirection.BORROW)
      .reduce((sum, l) => sum + l.outstanding, 0);

    const totalAssets = accountsTotal + holdingsTotal + lentOutstanding + advancesOutstanding;
    const totalLiabilities = borrowedOutstanding;
    return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
  }

  private async snapshotSpace(spaceId: string): Promise<void> {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space?.ownerUserId) return;
    const todayKey = taipeiDateKey(new Date());
    const existing = await this.prisma.financeNetWorthSnapshot.findUnique({
      where: { spaceId_date: { spaceId, date: taipeiDateKeyToUtcMidnight(todayKey) } },
    });
    if (existing) return;

    const { totalAssets, totalLiabilities, netWorth } = await this.computeNetWorth(space.ownerUserId, spaceId);
    await this.prisma.financeNetWorthSnapshot.upsert({
      where: { spaceId_date: { spaceId, date: taipeiDateKeyToUtcMidnight(todayKey) } },
      create: { spaceId, date: taipeiDateKeyToUtcMidnight(todayKey), totalAssets, totalLiabilities, netWorth },
      update: { totalAssets, totalLiabilities, netWorth },
    });
  }

  private async savingsRate(userId: string, spaceId: string, month: string) {
    const summary = await this.transactions.monthlySummary(userId, spaceId, month);
    const rate = summary.totalIncome > 0 ? (summary.totalIncome - summary.totalExpense) / summary.totalIncome : null;
    return { month, totalIncome: summary.totalIncome, totalExpense: summary.totalExpense, rate };
  }

  private async categoryBreakdown(userId: string, spaceId: string, month: string) {
    const summary = await this.transactions.monthlySummary(userId, spaceId, month);
    const expenseCategories = summary.byCategory.filter((c) => c.kind === FinanceTransactionType.EXPENSE);
    return expenseCategories
      .map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        total: c.total,
        percentage: summary.totalExpense > 0 ? c.total / summary.totalExpense : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /** 近 6 個月，每個月的分類支出佔比——直接沿用 monthlySummary，逐月呼叫
   * 一次（跟 trend() 的純 aggregate 比起來重一點，但 6 個月對個人規模的
   * 資料量完全不是問題，換來實作簡單、跟 categoryBreakdown 共用同一份
   * 邏輯不會兩邊寫岔）。 */
  private async categoryTrend(userId: string, spaceId: string) {
    const currentMonth = taipeiCurrentMonth();
    const months: string[] = [];
    for (let i = CATEGORY_TREND_MONTHS - 1; i >= 0; i--) {
      months.push(shiftMonth(currentMonth, -i));
    }
    const perMonth = await Promise.all(
      months.map(async (month) => ({ month, categories: await this.categoryBreakdown(userId, spaceId, month) })),
    );
    return perMonth;
  }

  /** 配置佔比 + 簡化年化報酬率（用「距離這檔最早一筆交易的天數」換算，
   * 不是真正考慮期間內多次進出金流的 XIRR——對個人記帳規模是合理的近似，
   * 跟持股均價法本身「不分批次、只看加權平均成本」的簡化程度一致）。 */
  private async portfolio(spaceId: string) {
    const holdings = await this.prisma.stockHolding.findMany({ where: { spaceId } });
    if (holdings.length === 0) return { totalMarketValue: 0, positions: [] };

    const prices = await this.prisma.stockPriceCache.findMany({
      where: { stockCode: { in: holdings.map((h) => h.stockCode) } },
    });
    const priceByCode = new Map(prices.map((p) => [p.stockCode, p]));

    const earliestDates = await Promise.all(
      holdings.map((h) =>
        this.prisma.stockTransaction.findFirst({
          where: { spaceId, stockCode: h.stockCode },
          orderBy: { tradeDate: 'asc' },
          select: { tradeDate: true },
        }),
      ),
    );

    const positions = holdings.map((h, i) => {
      const price = priceByCode.get(h.stockCode);
      const currentPrice = price?.intradayPrice ?? price?.dailyClosePrice ?? null;
      const marketValue = currentPrice != null ? h.shares * currentPrice : h.costBasis;
      const gainLoss = marketValue - h.costBasis;
      const totalReturn = h.costBasis > 0 ? gainLoss / h.costBasis : 0;
      const heldDays = earliestDates[i]?.tradeDate
        ? Math.max(1, Math.round((Date.now() - earliestDates[i]!.tradeDate.getTime()) / MS_PER_DAY))
        : null;
      const annualizedReturn =
        heldDays && h.costBasis > 0 ? Math.pow(1 + totalReturn, 365 / heldDays) - 1 : null;
      return {
        stockCode: h.stockCode,
        stockName: price?.stockName ?? null,
        marketValue,
        costBasis: h.costBasis,
        gainLoss,
        totalReturn,
        annualizedReturn,
      };
    });

    const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    return {
      totalMarketValue,
      positions: positions
        .map((p) => ({ ...p, allocation: totalMarketValue > 0 ? p.marketValue / totalMarketValue : 0 }))
        .sort((a, b) => b.marketValue - a.marketValue),
    };
  }

  /** 超支的預算分類 + 本月支出跟上個月比的變化百分比——「異常」的定義先
   * 從這兩個最直接的訊號開始，不做更複雜的統計異常偵測。 */
  private async overspendSummary(userId: string, spaceId: string, month: string) {
    const [budgetStatus, current, previous] = await Promise.all([
      this.budgets.monthlyStatus(userId, spaceId, month),
      this.transactions.monthlySummary(userId, spaceId, month),
      this.transactions.monthlySummary(userId, spaceId, shiftMonth(month, -1)),
    ]);
    const overBudget = budgetStatus
      .filter((b) => b.spent > b.monthlyAmount)
      .map((b) => ({ ...b, overBy: b.spent - b.monthlyAmount }));

    const expenseChange =
      previous.totalExpense > 0 ? (current.totalExpense - previous.totalExpense) / previous.totalExpense : null;

    return { overBudget, currentMonthExpense: current.totalExpense, previousMonthExpense: previous.totalExpense, expenseChange };
  }

  private async debtSummary(userId: string, spaceId: string) {
    const [loanItems, advanceItems] = await Promise.all([
      this.loans.list(userId, spaceId, { settled: false }),
      this.advances.list(userId, spaceId, { settled: false }),
    ]);
    const owedToMe = loanItems.items
      .filter((l) => l.direction === FinanceLoanDirection.LEND)
      .reduce((sum, l) => sum + l.outstanding, 0);
    const owedByMe = loanItems.items
      .filter((l) => l.direction === FinanceLoanDirection.BORROW)
      .reduce((sum, l) => sum + l.outstanding, 0);
    const advancesOutstanding = advanceItems.items.reduce((sum, a) => sum + a.outstanding, 0);
    return {
      owedToMe,
      owedByMe,
      advancesOutstanding,
      loanCount: loanItems.items.length,
      advanceCount: advanceItems.items.length,
    };
  }

  private async topExpenses(userId: string, spaceId: string, month: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const [year, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 1));
    return this.prisma.financeTransaction.findMany({
      where: { spaceId, type: FinanceTransactionType.EXPENSE, date: { gte: start, lt: end } },
      include: { category: true },
      orderBy: { amount: 'desc' },
      take: TOP_EXPENSES_COUNT,
    });
  }
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
