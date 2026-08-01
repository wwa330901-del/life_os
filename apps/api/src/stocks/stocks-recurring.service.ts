import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';
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
   * day-of-month + holiday-adjustment math as 定期交易) matches today, and
   * hasn't already reminded this month, gets a LINE reminder asking for
   * 成交價／投入成本 — never auto-creates a transaction, since a DCA fill
   * price is different every round. Sets `awaitingReply` so LineService can
   * tell a plain "股票代碼 成交價 投入成本" reply apart from other commands. */
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
      if (triggerDate.getUTCDate() !== today) continue;

      try {
        await this.prisma.stockRecurringInvestment.update({
          where: { id: plan.id },
          data: { lastTriggeredMonth: currentMonth, awaitingReply: true },
        });
        await this.lineNotifier.notifyBySpace(
          plan.spaceId,
          `🔔 定期定額提醒：該扣款買「${plan.stockCode}」了，回覆「${plan.stockCode} 成交價 投入成本」（例如「${plan.stockCode} 600 20000」）幫你記一筆並自動算股數。`,
        );
      } catch (error) {
        this.logger.error(`定期定額 ${plan.id} 提醒失敗`, error);
      }
    }
  }

  /** Called from LineService when a linked user replies "股票代碼 成交價
   * 投入成本" to a fired reminder. Finds the plan actually waiting on that
   * stock code, records the real StockTransaction (which then flows
   * through the same T+2 settlement cron as a manually-entered trade), and
   * clears `awaitingReply`. Returns null if no plan is waiting on that
   * code — the caller falls through to other command interpretations. */
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

    const tradeDate = new Date();
    const shares = totalCost / pricePerShare;
    await this.prisma.$transaction([
      this.prisma.stockTransaction.create({
        data: {
          spaceId,
          stockCode,
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
    return { shares };
  }
}
