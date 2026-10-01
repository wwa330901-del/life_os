import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiDateKey, utcDateKey } from '../common/taipei-date';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { daysBetween } from './credit-card';
import { detectSubscriptions, subscriptionReminderText, type Subscription } from './subscriptions';

/** 年繳要看到前一年的扣款，所以往回抓 25 個月。 */
const LOOKBACK_DAYS = 25 * 31;
const REMIND_DAYS_BEFORE = 3;

/** 訂閱費（2026-10-02）：從記帳偵測固定扣款、扣款前 3 天 LINE 提醒。 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: LineNotifierService,
  ) {}

  async list(spaceId: string, today = taipeiDateKey(new Date())): Promise<Subscription[]> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const rows = await this.prisma.financeTransaction.findMany({
      where: { spaceId, type: FinanceTransactionType.EXPENSE, date: { gte: since } },
      select: { date: true, amount: true, note: true, category: { select: { id: true, name: true } } },
    });
    return detectSubscriptions(
      rows.map((r) => ({
        date: utcDateKey(r.date),
        amount: r.amount,
        note: r.note,
        categoryId: r.category?.id ?? null,
        categoryName: r.category?.name ?? null,
      })),
      today,
    );
  }

  async listForUser(userId: string): Promise<Subscription[] | null> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId }, select: { id: true } });
    return space ? this.list(space.id) : null;
  }

  @Cron('0 9 * * *', { timeZone: 'Asia/Taipei' })
  async remind(): Promise<void> {
    const today = taipeiDateKey(new Date());
    const links = await this.prisma.lineAccountLink.findMany({
      where: { lineUserId: { not: null }, subscriptionReminderEnabled: true },
      select: { userId: true },
    });
    for (const { userId } of links) {
      try {
        const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId }, select: { id: true } });
        if (!space) continue;
        for (const sub of await this.list(space.id, today)) {
          if (daysBetween(today, sub.nextDate) !== REMIND_DAYS_BEFORE) continue;
          const key = `sub:${sub.key}:${sub.nextDate}`.slice(0, 190);
          const created = await this.prisma.financeAlertLog.createMany({ data: [{ spaceId: space.id, key }], skipDuplicates: true });
          if (created.count === 0) continue;
          await this.notifier.notifyByUser(userId, subscriptionReminderText(sub));
        }
      } catch (error) {
        this.logger.error(`訂閱提醒失敗（userId=${userId}）`, error);
      }
    }
  }
}
