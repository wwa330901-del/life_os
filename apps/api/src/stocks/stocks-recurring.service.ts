import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';
import { StocksHoldingsService } from './stocks-holdings.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { effectiveTriggerDate } from '../finance/finance-recurring-schedule';
import { computeSettlementDate } from './stock-settlement-schedule';
import { FinanceRecurringHolidayAdjustment, StockTransactionType } from '../../generated/prisma/client.js';
import { CreateStockRecurringInvestmentDto } from './dto/create-stock-recurring-investment.dto';
import { UpdateStockRecurringInvestmentDto } from './dto/update-stock-recurring-investment.dto';

@Injectable()
export class StocksRecurringService {
  private readonly logger = new Logger(StocksRecurringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StocksAccessService,
    private readonly lineNotifier: LineNotifierService,
    private readonly holdings: StocksHoldingsService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    return this.prisma.stockRecurringInvestment.findMany({
      where: { spaceId },
      orderBy: { dayOfMonth: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateStockRecurringInvestmentDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.assertAccount(spaceId, dto.accountId);
    return this.prisma.stockRecurringInvestment.create({
      data: {
        spaceId,
        stockCode: dto.stockCode,
        dayOfMonth: dto.dayOfMonth,
        holidayAdjustment: dto.holidayAdjustment ?? FinanceRecurringHolidayAdjustment.NONE,
        accountId: dto.accountId,
      },
    });
  }

  async update(userId: string, spaceId: string, id: string, dto: UpdateStockRecurringInvestmentDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, id);
    if (dto.accountId !== undefined) await this.assertAccount(spaceId, dto.accountId);
    return this.prisma.stockRecurringInvestment.update({
      where: { id },
      data: {
        ...(dto.stockCode !== undefined && { stockCode: dto.stockCode }),
        ...(dto.dayOfMonth !== undefined && { dayOfMonth: dto.dayOfMonth }),
        ...(dto.holidayAdjustment !== undefined && { holidayAdjustment: dto.holidayAdjustment }),
        ...(dto.accountId !== undefined && { accountId: dto.accountId }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
  }

  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, id);
    await this.prisma.stockRecurringInvestment.delete({ where: { id } });
  }

  private async assertAccount(spaceId: string, accountId: string) {
    const account = await this.prisma.financeAccount.findUnique({ where: { id: accountId } });
    if (!account || account.spaceId !== spaceId) {
      throw new BadRequestException('帳戶不存在');
    }
  }

  private async getOrThrow(spaceId: string, id: string) {
    const row = await this.prisma.stockRecurringInvestment.findUnique({ where: { id } });
    if (!row || row.spaceId !== spaceId) {
      throw new NotFoundException('Stock recurring investment not found');
    }
    return row;
  }

  /** Once a day: any active DCA plan whose effective trigger date (same
   * day-of-month + holiday-adjustment math as 定期交易) has arrived (today ON
   * OR AFTER it, not just "exactly today" — see below), and hasn't already
   * reminded this month, gets a LINE reminder asking for 成交價／投入成本 —
   * never auto-creates a transaction, since a DCA fill price is different
   * every round. Sets `awaitingReply` so LineService can tell a plain
   * "股票代碼 成交價 投入成本" reply apart from other commands.
   *
   * 2026-08-11: `lastTriggeredMonth` used to get written BEFORE the LINE push
   * was attempted — if the push itself failed (network hiccup, LINE API
   * outage, the process restarting mid-cron), the plan was already marked
   * "handled this month" and silently never got a working reminder at all
   * for the rest of the month, no retry, no visibility. Now the DB write
   * only happens after the push actually succeeds, and the day check is
   * "on or after" the trigger date instead of "exactly on it" — so a missed
   * day (this bug, a deploy restart at exactly 9am, etc.) self-heals on the
   * very next day's run instead of silently skipping the whole month. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Taipei' })
  async sendDueReminders() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const today = now.getDate();

    const due = await this.prisma.stockRecurringInvestment.findMany({
      where: { active: true, lastTriggeredMonth: { not: currentMonth } },
    });

    for (const plan of due) {
      const triggerDate = effectiveTriggerDate(
        now.getFullYear(),
        now.getMonth(),
        plan.dayOfMonth,
        lastDayOfMonth,
        plan.holidayAdjustment,
      );
      if (triggerDate.getUTCDate() > today) continue;

      try {
        await this.lineNotifier.notifyBySpace(
          plan.spaceId,
          `🔔 定期定額提醒：該扣款買「${plan.stockCode}」了，回覆「${plan.stockCode} 成交價 投入成本」（例如「${plan.stockCode} 600 20000」）幫你記一筆並自動算股數。`,
        );
        await this.prisma.stockRecurringInvestment.update({
          where: { id: plan.id },
          data: { lastTriggeredMonth: currentMonth, awaitingReply: true },
        });
      } catch (error) {
        this.logger.error(`定期定額 ${plan.id} 提醒失敗`, error);
      }
    }
  }

  /** Called from LineService when a linked user replies "股票代碼 成交價
   * 投入成本" to a fired reminder. Finds the plan actually waiting on that
   * stock code. Returns null if no plan is waiting on that code — the
   * caller falls through to other command interpretations. */
  async fulfillPendingReply(
    spaceId: string,
    stockCode: string,
    pricePerShare: number,
    totalCost: number,
  ): Promise<{ shares: number } | null> {
    const plan = await this.prisma.stockRecurringInvestment.findFirst({
      where: { spaceId, stockCode, awaitingReply: true },
    });
    if (!plan) return null;
    return this.doFulfill(plan, pricePerShare, totalCost);
  }

  /** App 端登記成交 — same fill-in as `fulfillPendingReply`, but the caller
   * already knows which specific plan (tapped a card showing "等待登記成交"
   * in the App), so this looks up by id instead of "the one plan currently
   * awaiting reply for this stock code". */
  async fulfillById(
    userId: string,
    spaceId: string,
    id: string,
    pricePerShare: number,
    totalCost: number,
  ): Promise<{ shares: number }> {
    await this.access.assertPersonalSpace(userId, spaceId);
    const plan = await this.getOrThrow(spaceId, id);
    if (!plan.awaitingReply) {
      throw new BadRequestException('這個計畫目前不是在等待登記成交的狀態');
    }
    return this.doFulfill(plan, pricePerShare, totalCost);
  }

  /** Records the real StockTransaction (which then flows through the same
   * T+2 settlement cron as a manually-entered trade) and clears
   * `awaitingReply`. */
  private async doFulfill(
    plan: { id: string; spaceId: string; stockCode: string; accountId: string },
    pricePerShare: number,
    totalCost: number,
  ): Promise<{ shares: number }> {
    const tradeDate = new Date();
    const shares = totalCost / pricePerShare;
    await this.prisma.$transaction([
      this.prisma.stockTransaction.create({
        data: {
          spaceId: plan.spaceId,
          stockCode: plan.stockCode,
          type: StockTransactionType.BUY,
          pricePerShare,
          totalCost,
          shares,
          tradeDate,
          settlementDate: computeSettlementDate(tradeDate),
          accountId: plan.accountId,
          note: '定期定額',
        },
      }),
      this.prisma.stockRecurringInvestment.update({ where: { id: plan.id }, data: { awaitingReply: false } }),
    ]);
    await this.holdings.recompute(plan.spaceId, plan.stockCode);
    return { shares };
  }
}
