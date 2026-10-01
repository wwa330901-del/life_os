import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { FinanceBudgetsService } from '../finance/finance-budgets.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { formatTaipeiDateTime, taipeiCurrentMonth, taipeiDateKey, taipeiDateKeyToUtcMidnight, taipeiTodayRange } from '../common/taipei-date';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const LIST_MAX = 6;
const BUDGET_WARN_RATIO = 0.8;
const DUE_REMINDER_LEAD_MS = 60 * 60 * 1000;

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** 提醒（2026-10-01 使用者排的 A 項）：
 * - 每日早報 08:00：今天的行程、今天到期與過期的代辦、昨天花多少、這個月
 *   用到 80% 以上的預算。什麼都沒有就不傳。傳「關閉早報」可關。
 * - 有時間的代辦：到期前 1 小時提醒一次（`dueReminderSentAt` 記下已提醒）。
 * 預算超支本來就在記帳當下即時通知（FinanceBudgetsService），這裡不重複。 */
@Injectable()
export class DailyBriefService {
  private readonly logger = new Logger(DailyBriefService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly transactions: FinanceTransactionsService,
    private readonly budgets: FinanceBudgetsService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron('0 8 * * *', { timeZone: 'Asia/Taipei' })
  async sendMorningBriefs() {
    const links = await this.prisma.lineAccountLink.findMany({
      where: { lineUserId: { not: null }, morningBriefEnabled: true },
      select: { userId: true },
    });
    for (const { userId } of links) {
      try {
        const text = await this.build(userId);
        if (text) await this.lineNotifier.notifyByUser(userId, text);
      } catch (error) {
        this.logger.error(`每日早報失敗（userId=${userId}）`, error as Error);
      }
    }
  }

  /** The brief text, or null when there's nothing worth sending. */
  async build(userId: string, now = new Date()): Promise<string | null> {
    const today = taipeiTodayRange();
    const [personal, calendar] = await Promise.all([
      this.prisma.space.findUnique({ where: { ownerUserId: userId } }),
      this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } }),
    ]);

    const [events, dueToday, overdue] = await Promise.all([
      calendar
        ? this.calendarEvents.list(userId, calendar.id, today.start.toISOString(), new Date(today.end.getTime() - 1).toISOString())
        : Promise.resolve([]),
      this.prisma.projectTodo.findMany({
        where: { personalOwnerUserId: userId, done: false, dueDate: { gte: today.start, lt: today.end } },
        select: { title: true, dueDate: true, dueDateAllDay: true },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.projectTodo.findMany({
        where: { personalOwnerUserId: userId, done: false, isOngoing: false, dueDate: { lt: today.start } },
        select: { title: true },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    const sections: string[] = [];
    if (events.length > 0) {
      sections.push(
        ['📅 今天的行程', ...events.slice(0, LIST_MAX).map((e) => `・${e.allDay ? '全天' : formatTaipeiDateTime(e.startAt, false).split(' ').pop()} ${e.title}`)].join('\n'),
      );
    }
    if (dueToday.length > 0 || overdue.length > 0) {
      const lines = ['✅ 代辦'];
      for (const t of dueToday.slice(0, LIST_MAX)) {
        lines.push(`・${t.title}${t.dueDateAllDay || !t.dueDate ? '（今天）' : `（${formatTaipeiDateTime(t.dueDate, false).split(' ').pop()}）`}`);
      }
      if (overdue.length > 0) {
        lines.push(`⏳ 還有 ${overdue.length} 件過期：${overdue.slice(0, 3).map((t) => t.title).join('、')}${overdue.length > 3 ? '…' : ''}`);
      }
      sections.push(lines.join('\n'));
    }

    if (personal) {
      const yesterdayKey = taipeiDateKeyToUtcMidnight(taipeiDateKey(new Date(now.getTime() - MS_PER_DAY)));
      const [yesterday, budgetStatus] = await Promise.all([
        this.transactions.rangeSummary(userId, personal.id, yesterdayKey, new Date(yesterdayKey.getTime() + MS_PER_DAY)),
        this.budgets.monthlyStatus(userId, personal.id, taipeiCurrentMonth()),
      ]);
      const lines: string[] = [];
      if (yesterday.totalExpense > 0) lines.push(`昨天花了 ${fmt(yesterday.totalExpense)}`);
      const nearLimit = budgetStatus.filter((b) => b.monthlyAmount > 0 && b.spent / b.monthlyAmount >= BUDGET_WARN_RATIO);
      for (const b of nearLimit) {
        const ratio = Math.round((b.spent / b.monthlyAmount) * 100);
        lines.push(`${ratio >= 100 ? '⚠️' : '🟡'} ${b.categoryName}預算已用 ${ratio}%（剩 ${fmt(Math.max(0, b.monthlyAmount - b.spent))}）`);
      }
      if (lines.length > 0) sections.push(['💰 錢', ...lines].join('\n'));
    }

    if (sections.length === 0) return null;
    const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const title = `☀️ 早安！${shifted.getUTCMonth() + 1}/${shifted.getUTCDate()}（${WEEKDAYS[shifted.getUTCDay()]}）`;
    return [title, '', sections.join('\n\n'), '', '（不想收到早報就傳「關閉早報」）'].join('\n');
  }

  /** Every 5 minutes: timed todos due within the next hour, once each. */
  @Cron('*/5 * * * *')
  async sendDueReminders() {
    const now = new Date();
    const todos = await this.prisma.projectTodo.findMany({
      where: {
        done: false,
        dueDateAllDay: false,
        dueReminderSentAt: null,
        personalOwnerUserId: { not: null },
        personalOwner: { is: { lineAccountLink: { is: { todoReminderEnabled: true } } } },
        dueDate: { gt: now, lte: new Date(now.getTime() + DUE_REMINDER_LEAD_MS) },
      },
      select: { id: true, title: true, dueDate: true, personalOwnerUserId: true },
    });
    for (const todo of todos) {
      try {
        const minutes = Math.max(1, Math.round((todo.dueDate!.getTime() - now.getTime()) / 60000));
        const when = formatTaipeiDateTime(todo.dueDate!, false).split(' ').pop();
        await this.lineNotifier.notifyByUser(todo.personalOwnerUserId!, `⏰ ${minutes} 分鐘後（${when}）：${todo.title}\n做完跟我說「${todo.title}做完了」就會打勾`);
        await this.prisma.projectTodo.update({ where: { id: todo.id }, data: { dueReminderSentAt: now } });
      } catch (error) {
        this.logger.error(`代辦到期提醒失敗（todoId=${todo.id}）`, error as Error);
      }
    }
  }
}
