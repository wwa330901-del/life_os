import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import {
  FinanceCategoriesService,
  STOCK_BUY_CATEGORY_NAME,
  STOCK_SELL_CATEGORY_NAME,
} from '../finance/finance-categories.service';
import { FinanceCategoryKind, FinanceTransactionType, StockTransactionType } from '../../generated/prisma/client.js';

@Injectable()
export class StocksSettlementService {
  private readonly logger = new Logger(StocksSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
    private readonly financeAccounts: FinanceAccountsService,
    private readonly financeCategories: FinanceCategoriesService,
  ) {}

  /** Once a day: any unsettled StockTransaction whose T+2 settlementDate is
   * today or earlier (catch-up for a missed run) gets its real
   * FinanceTransaction created now — BUY debits the account, SELL credits
   * it — matching the day the money actually moves in a real brokerage
   * account, not the day the trade was registered. Every settlement gets
   * auto-filed into the space's 股票買/股票賣 category (2026-08-05 — these
   * used to have no category at all, invisible to 財務總覽/預算) —
   * `findOrCreateSystemCategory` self-heals a pre-existing space that
   * predates this feature, no backfill migration needed. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Taipei' })
  async settleDueTransactions() {
    const today = utcDateOnly(new Date());
    const due = await this.prisma.stockTransaction.findMany({
      where: { settled: false, settlementDate: { lte: today } },
    });

    for (const t of due) {
      try {
        const label = t.type === StockTransactionType.BUY ? '買入' : '賣出';
        const category =
          t.type === StockTransactionType.BUY
            ? await this.financeCategories.findOrCreateSystemCategory(
                t.spaceId,
                STOCK_BUY_CATEGORY_NAME,
                FinanceCategoryKind.EXPENSE,
              )
            : await this.financeCategories.findOrCreateSystemCategory(
                t.spaceId,
                STOCK_SELL_CATEGORY_NAME,
                FinanceCategoryKind.INCOME,
              );
        await this.prisma.$transaction([
          this.prisma.financeTransaction.create({
            data: {
              spaceId: t.spaceId,
              type: t.type === StockTransactionType.BUY ? FinanceTransactionType.EXPENSE : FinanceTransactionType.INCOME,
              amount: t.totalCost,
              accountId: t.accountId,
              categoryId: category.id,
              date: today,
              note: `股票${label} ${t.stockCode}（交割入帳）`,
            },
          }),
          this.prisma.stockTransaction.update({ where: { id: t.id }, data: { settled: true } }),
        ]);
        await this.lineNotifier.notifyBySpace(
          t.spaceId,
          `📈 股票交割：${label} ${t.stockCode} 已交割，${t.type === StockTransactionType.BUY ? '扣款' : '入帳'} ${Math.round(t.totalCost).toLocaleString('en-US')}。`,
        );
      } catch (error) {
        this.logger.error(`股票交易 ${t.id} 交割失敗`, error);
      }
    }
  }

  /** Once a day: for every unsettled BUY whose settlementDate is tomorrow,
   * sum the cash each account needs and warn by LINE if that account's
   * current derived balance won't cover it — so the user isn't surprised
   * by an overdraft the next morning. */
  @Cron(CronExpression.EVERY_DAY_AT_8PM, { timeZone: 'Asia/Taipei' })
  async warnIfInsufficientForTomorrow() {
    const tomorrow = utcDateOnly(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const dueTomorrow = await this.prisma.stockTransaction.findMany({
      where: { settled: false, settlementDate: tomorrow, type: StockTransactionType.BUY },
      include: { account: true },
    });
    if (dueTomorrow.length === 0) return;

    const neededByAccount = new Map<string, { accountName: string; spaceId: string; needed: number }>();
    for (const t of dueTomorrow) {
      const entry = neededByAccount.get(t.accountId) ?? {
        accountName: t.account.name,
        spaceId: t.spaceId,
        needed: 0,
      };
      entry.needed += t.totalCost;
      neededByAccount.set(t.accountId, entry);
    }

    for (const [accountId, info] of neededByAccount) {
      const space = await this.prisma.space.findUnique({ where: { id: info.spaceId } });
      if (!space?.ownerUserId) continue;
      const accounts = await this.financeAccounts.list(space.ownerUserId, info.spaceId);
      const account = accounts.find((a) => a.id === accountId);
      if (!account || account.balance >= info.needed) continue;

      await this.lineNotifier.notifyBySpace(
        info.spaceId,
        `⚠️ 明天股票交割提醒：「${info.accountName}」帳戶明天需要交割 ${Math.round(info.needed).toLocaleString('en-US')}，目前餘額只有 ${Math.round(account.balance).toLocaleString('en-US')}，可能不夠，記得先準備。`,
      );
    }
  }
}

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}
