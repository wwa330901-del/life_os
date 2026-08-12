import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';
import { StocksHoldingsService } from './stocks-holdings.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { effectiveTriggerDate } from '../finance/finance-recurring-schedule';
import { utcDateOnly } from './stocks-settlement.service';
import {
  FinanceCategoriesService,
  STOCK_BUY_CATEGORY_NAME,
} from '../finance/finance-categories.service';
import {
  FinanceCategoryKind,
  FinanceRecurringHolidayAdjustment,
  FinanceTransactionType,
  StockTransactionType,
} from '../../generated/prisma/client.js';
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
    private readonly financeCategories: FinanceCategoriesService,
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
        monthlyAmount: dto.monthlyAmount,
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
        ...(dto.monthlyAmount !== undefined && { monthlyAmount: dto.monthlyAmount }),
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
   * OR AFTER it, not just "exactly today" — see below) and isn't already
   * waiting on a reply, gets a pending "待填成交價" StockTransaction created
   * immediately (2026-08-12 — this used to be reminder-only, no record at
   * all until the reply came in) plus a LINE reminder asking for just
   * 成交價 — the plan's own `monthlyAmount` supplies the amount side.
   * `awaitingReply` doubles as "don't fire again while last month's is still
   * outstanding" — a plan stuck unanswered for over a month simply doesn't
   * get a second pending row layered on top; it keeps nudging for the one
   * that already exists.
   *
   * `monthlyAmount == null` (a pre-2026-08-12 plan the user hasn't
   * re-saved since this feature shipped) is skipped rather than reminded
   * with a broken/old-style message — the plan self-heals the next time its
   * owner opens the editor and saves it (the App's edit form now requires
   * this field).
   *
   * The pending-row creation itself is idempotent (checks for an existing
   * pending row for this plan before creating another) so a notify failure
   * that leaves `awaitingReply` false doesn't create a duplicate pending row
   * on the next day's retry — it just re-sends the reminder for the same row.
   *
   * 2026-08-11: `lastTriggeredMonth` used to get written BEFORE the LINE push
   * was attempted — if the push itself failed, the plan was already marked
   * "handled this month" and silently never got a working reminder at all
   * for the rest of the month, no retry, no visibility. Now the DB write
   * only happens after the push actually succeeds, and the day check is
   * "on or after" the trigger date instead of "exactly on it" — so a missed
   * day self-heals on the very next day's run instead of silently skipping
   * the whole month. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Taipei' })
  async sendDueReminders() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const today = now.getDate();

    const due = await this.prisma.stockRecurringInvestment.findMany({
      where: {
        active: true,
        lastTriggeredMonth: { not: currentMonth },
        monthlyAmount: { not: null },
        awaitingReply: false,
      },
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
        const existingPendingTx = await this.prisma.stockTransaction.findFirst({
          where: { recurringInvestmentId: plan.id, pending: true },
        });
        if (!existingPendingTx) {
          await this.prisma.stockTransaction.create({
            data: {
              spaceId: plan.spaceId,
              stockCode: plan.stockCode,
              type: StockTransactionType.BUY,
              pricePerShare: 0,
              totalCost: plan.monthlyAmount!,
              shares: 0,
              tradeDate: triggerDate,
              settlementDate: triggerDate,
              accountId: plan.accountId,
              note: '定期定額',
              pending: true,
              recurringInvestmentId: plan.id,
            },
          });
        }

        const amount = Math.round(plan.monthlyAmount!).toLocaleString('en-US');
        await this.lineNotifier.notifyBySpace(
          plan.spaceId,
          `🔔 定期定額提醒：該扣款買「${plan.stockCode}」了（每期 NT$${amount}，已先記一筆待填成交價，也可以到 App「股票」補），回覆「${plan.stockCode} 成交價」（例如「${plan.stockCode} 600」）幫你依這個金額自動算出可以買多少整股並立即扣款。`,
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

  /** Called from LineService when a linked user replies "股票代碼 成交價" to
   * a fired reminder. Finds the plan actually waiting on that stock code.
   * Returns null if no plan is waiting on that code — the caller falls
   * through to other command interpretations. */
  async fulfillPendingReply(
    spaceId: string,
    stockCode: string,
    pricePerShare: number,
  ): Promise<{ shares: number; totalCost: number } | null> {
    const plan = await this.prisma.stockRecurringInvestment.findFirst({
      where: { spaceId, stockCode, awaitingReply: true },
    });
    if (!plan) return null;
    return this.doFulfill(plan, pricePerShare);
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
  ): Promise<{ shares: number; totalCost: number }> {
    await this.access.assertPersonalSpace(userId, spaceId);
    const plan = await this.getOrThrow(spaceId, id);
    if (!plan.awaitingReply) {
      throw new BadRequestException('這個計畫目前不是在等待登記成交的狀態');
    }
    return this.doFulfill(plan, pricePerShare);
  }

  /** 股票只能整股買——用「設定的每期金額 ÷ 成交價」無條件捨去算出買得起的
   * 整股數，再回推實際花費（`totalCost` 可能略低於 `monthlyAmount`，捨去
   * 的零頭不會被花掉，也不會被記錄成任何形式的剩餘額度——下一期一樣是用
   * 完整的 monthlyAmount 去算）。填入成交價這一刻就地更新那筆到期時自動
   * 建立的「待填成交價」交易（不是另外新建一筆），並且直接完成交割（T,
   * 不等 T+2、不等隔天的每日交割排程）——一般手動股票交易維持原本 T+2
   * 排程交割，只有定期定額是這個例外，因為到「回覆成交價」這一刻，
   * 早就已經超過真正的成交日了，沒有理由再讓使用者多等一天。 */
  private async doFulfill(
    plan: { id: string; spaceId: string; stockCode: string; accountId: string; monthlyAmount: number | null },
    pricePerShare: number,
  ): Promise<{ shares: number; totalCost: number }> {
    if (!plan.monthlyAmount) {
      throw new BadRequestException('這個定期定額計畫還沒設定每期金額，請先到 App 編輯補上。');
    }
    const pendingTx = await this.prisma.stockTransaction.findFirst({
      where: { recurringInvestmentId: plan.id, pending: true },
      orderBy: { tradeDate: 'asc' },
    });
    if (!pendingTx) {
      throw new BadRequestException('找不到這個定期定額待填成交價的交易，可能已經處理過了。');
    }

    const shares = Math.floor(plan.monthlyAmount / pricePerShare);
    if (shares < 1) {
      throw new BadRequestException(
        `這個成交價下，每期金額 NT$${Math.round(plan.monthlyAmount).toLocaleString('en-US')} 連 1 股都買不到，請確認成交價有沒有打對。`,
      );
    }
    const totalCost = shares * pricePerShare;
    const today = utcDateOnly(new Date());

    const category = await this.financeCategories.findOrCreateSystemCategory(
      plan.spaceId,
      STOCK_BUY_CATEGORY_NAME,
      FinanceCategoryKind.EXPENSE,
    );
    await this.prisma.$transaction([
      this.prisma.stockTransaction.update({
        where: { id: pendingTx.id },
        data: { pricePerShare, shares, totalCost, settlementDate: today, pending: false, settled: true },
      }),
      this.prisma.financeTransaction.create({
        data: {
          spaceId: plan.spaceId,
          type: FinanceTransactionType.EXPENSE,
          amount: totalCost,
          accountId: plan.accountId,
          categoryId: category.id,
          date: today,
          note: `股票買入 ${plan.stockCode}（定期定額交割入帳）`,
        },
      }),
      this.prisma.stockRecurringInvestment.update({ where: { id: plan.id }, data: { awaitingReply: false } }),
    ]);
    await this.holdings.recompute(plan.spaceId, plan.stockCode);
    return { shares, totalCost };
  }
}
