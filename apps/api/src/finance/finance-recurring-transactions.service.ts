import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceTransactionsService } from './finance-transactions.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { CreateFinanceRecurringTransactionDto } from './dto/create-finance-recurring-transaction.dto';
import { UpdateFinanceRecurringTransactionDto } from './dto/update-finance-recurring-transaction.dto';

type RecurringWithRelations = {
  id: string;
  spaceId: string;
  type: FinanceTransactionType;
  amount: number | null;
  note: string | null;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  account: { name: string };
  toAccount: { name: string } | null;
  category: { name: string } | null;
};

@Injectable()
export class FinanceRecurringTransactionsService {
  private readonly logger = new Logger(FinanceRecurringTransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
    private readonly transactions: FinanceTransactionsService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    return this.prisma.financeRecurringTransaction.findMany({
      where: { spaceId },
      orderBy: { dayOfMonth: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateFinanceRecurringTransactionDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.transactions.validate(spaceId, dto);
    return this.prisma.financeRecurringTransaction.create({
      data: {
        spaceId,
        type: dto.type,
        amount: dto.amount ?? null,
        accountId: dto.accountId,
        toAccountId: dto.type === FinanceTransactionType.TRANSFER ? dto.toAccountId : null,
        categoryId: dto.type === FinanceTransactionType.TRANSFER ? null : dto.categoryId,
        dayOfMonth: dto.dayOfMonth,
        note: dto.note,
      },
    });
  }

  async update(userId: string, spaceId: string, id: string, dto: UpdateFinanceRecurringTransactionDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const existing = await this.getOrThrow(spaceId, id);
    const merged = {
      type: dto.type ?? existing.type,
      accountId: dto.accountId ?? existing.accountId,
      toAccountId: dto.toAccountId !== undefined ? dto.toAccountId : existing.toAccountId,
      categoryId: dto.categoryId !== undefined ? dto.categoryId : existing.categoryId,
    };
    await this.transactions.validate(spaceId, merged);
    return this.prisma.financeRecurringTransaction.update({
      where: { id },
      data: {
        type: merged.type,
        accountId: merged.accountId,
        toAccountId: merged.type === FinanceTransactionType.TRANSFER ? merged.toAccountId : null,
        categoryId: merged.type === FinanceTransactionType.TRANSFER ? null : merged.categoryId,
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.dayOfMonth !== undefined && { dayOfMonth: dto.dayOfMonth }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
  }

  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, id);
    await this.prisma.financeRecurringTransaction.delete({ where: { id } });
  }

  private async getOrThrow(spaceId: string, id: string) {
    const row = await this.prisma.financeRecurringTransaction.findUnique({ where: { id } });
    if (!row || row.spaceId !== spaceId) {
      throw new NotFoundException('Recurring transaction not found');
    }
    return row;
  }

  /** Once a day: any active recurring entry whose `dayOfMonth` matches
   * today — clamped to the month's actual last day, so "day 31" still
   * fires in a 30-day month, and "day 31" in February fires on the 28th
   * (or 29th) — and hasn't already fired this month gets processed. Runs
   * daily rather than checking "is today the day" once a month so a
   * missed run (e.g. Render's free tier asleep) still catches up the next
   * time it wakes, as long as that's still within the same month. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Taipei' })
  async processDueRecurringTransactions() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const today = now.getDate();

    const due = await this.prisma.financeRecurringTransaction.findMany({
      where: { active: true, lastTriggeredMonth: { not: currentMonth } },
      include: { account: true, toAccount: true, category: true },
    });

    for (const r of due) {
      const triggerDay = Math.min(r.dayOfMonth, lastDayOfMonth);
      if (triggerDay !== today) continue;

      try {
        await this.fire(r, currentMonth);
      } catch (error) {
        this.logger.error(`定期交易 ${r.id} 處理失敗`, error);
      }
    }
  }

  private async fire(r: RecurringWithRelations, currentMonth: string) {
    const label = r.note ?? this.describe(r);

    if (r.amount != null) {
      await this.prisma.financeTransaction.create({
        data: {
          spaceId: r.spaceId,
          type: r.type,
          amount: r.amount,
          accountId: r.accountId,
          toAccountId: r.toAccountId,
          categoryId: r.categoryId,
          date: new Date(),
          note: r.note ?? undefined,
        },
      });
      await this.lineNotifier.notifyBySpace(
        r.spaceId,
        `🔁 已自動記帳：${label} ${Math.round(r.amount).toLocaleString('en-US')}`,
      );
    } else {
      await this.lineNotifier.notifyBySpace(r.spaceId, `🔔 定期提醒：該處理「${label}」了，記得到元序記一筆。`);
    }

    await this.prisma.financeRecurringTransaction.update({
      where: { id: r.id },
      data: { lastTriggeredMonth: currentMonth },
    });
  }

  private describe(r: RecurringWithRelations): string {
    if (r.type === FinanceTransactionType.TRANSFER) {
      return `${r.account.name} → ${r.toAccount?.name ?? ''}`;
    }
    return r.category?.name ?? (r.type === FinanceTransactionType.INCOME ? '收入' : '支出');
  }
}
