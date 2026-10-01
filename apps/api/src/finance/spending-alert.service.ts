import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight, utcDateKey } from '../common/taipei-date';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { categorySpikes, largeExpenseThreshold, median, spendingAlertText, type CategorySpend } from './spending-alerts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM' n months before the given 'YYYY-MM'. */
function monthBefore(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 花費異常提醒（2026-10-02）：每晚 21:00 看這個月哪個分類花太兇、過去
 * 24 小時有沒有特別大的單筆，合成一則 LINE；同一件事只提醒一次。有設預算
 * 的分類跳過（記帳當下就有超支通知）。 */
@Injectable()
export class SpendingAlertService {
  private readonly logger = new Logger(SpendingAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: LineNotifierService,
  ) {}

  @Cron('0 21 * * *', { timeZone: 'Asia/Taipei' })
  async run(): Promise<void> {
    const links = await this.prisma.lineAccountLink.findMany({
      where: { lineUserId: { not: null }, spendingAlertEnabled: true },
      select: { userId: true },
    });
    for (const { userId } of links) {
      try {
        const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId }, select: { id: true } });
        if (!space) continue;
        const text = await this.alertFor(space.id);
        if (text) await this.notifier.notifyByUser(userId, text);
      } catch (error) {
        this.logger.error(`花費提醒失敗（userId=${userId}）`, error);
      }
    }
  }

  /** 有新的異常就回訊息（並記下已提醒），沒有就 null。 */
  async alertFor(spaceId: string, now = new Date()): Promise<string | null> {
    const today = taipeiDateKey(now);
    const month = today.slice(0, 7);
    const since = taipeiDateKeyToUtcMidnight(`${monthBefore(month, 3)}-01`);
    const [expenses, budgets] = await Promise.all([
      this.prisma.financeTransaction.findMany({
        where: { spaceId, type: FinanceTransactionType.EXPENSE, date: { gte: since } },
        select: {
          id: true,
          amount: true,
          date: true,
          note: true,
          createdAt: true,
          category: { select: { id: true, name: true, parentId: true } },
        },
      }),
      this.prisma.financeBudget.findMany({ where: { spaceId }, select: { categoryId: true } }),
    ]);
    const budgeted = new Set(budgets.map((b) => b.categoryId));
    const months = [1, 2, 3].map((n) => monthBefore(month, n));

    const byCategory = new Map<string, CategorySpend>();
    for (const t of expenses) {
      const c = t.category;
      if (!c || budgeted.has(c.id) || (c.parentId && budgeted.has(c.parentId))) continue;
      const row = byCategory.get(c.id) ?? { categoryId: c.id, name: c.name, monthToDate: 0, previousMonths: [0, 0, 0] };
      const m = utcDateKey(t.date).slice(0, 7);
      if (m === month) row.monthToDate += t.amount;
      const i = months.indexOf(m);
      if (i >= 0) row.previousMonths[i] += t.amount;
      byCategory.set(c.id, row);
    }
    const spikes = categorySpikes([...byCategory.values()]);

    // 過去 24 小時新記的（含補記以前日期的）單筆大額。
    const recentCutoff = new Date(now.getTime() - DAY_MS);
    const historyCutoff = new Date(now.getTime() - 90 * DAY_MS);
    const recent = expenses.filter((t) => t.createdAt >= recentCutoff);
    const history = expenses.filter((t) => t.createdAt < recentCutoff && t.date >= historyCutoff).map((t) => t.amount);
    const threshold = largeExpenseThreshold(history);
    const large = recent.filter((t) => t.amount >= threshold);

    const keys = [...spikes.map((s) => `cat:${s.categoryId}:${month}`), ...large.map((t) => `tx:${t.id}`)];
    if (keys.length === 0) return null;
    const sent = new Set(
      (await this.prisma.financeAlertLog.findMany({ where: { spaceId, key: { in: keys } }, select: { key: true } })).map((l) => l.key),
    );
    const newSpikes = spikes.filter((s) => !sent.has(`cat:${s.categoryId}:${month}`));
    const newLarge = large.filter((t) => !sent.has(`tx:${t.id}`));
    const text = spendingAlertText(
      newSpikes,
      newLarge.map((t) => ({ amount: t.amount, category: t.category?.name ?? null, note: t.note, date: utcDateKey(t.date) })),
      median(history),
    );
    if (!text) return null;
    await this.prisma.financeAlertLog.createMany({
      data: [...newSpikes.map((s) => `cat:${s.categoryId}:${month}`), ...newLarge.map((t) => `tx:${t.id}`)].map((key) => ({ spaceId, key })),
      skipDuplicates: true,
    });
    return text;
  }
}
