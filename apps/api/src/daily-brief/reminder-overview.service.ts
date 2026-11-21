import { Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { MemoryService } from '../memory/memory.service';
import { CreditCardService } from '../finance/credit-card.service';
import { FinanceRecurringTransactionsService } from '../finance/finance-recurring-transactions.service';
import { taipeiDateKey, utcDateKey } from '../common/taipei-date';

export interface UpcomingReminder {
  /** YYYY-MM-DD（台北） */
  date: string;
  /** 有時間的才有 HH:mm */
  time: string | null;
  kind: 'todo' | 'birthday' | 'card' | 'loan' | 'recurring' | 'trip';
  title: string;
}

const KIND_LABEL: Record<UpcomingReminder['kind'], string> = {
  todo: '⏰',
  birthday: '🎂',
  card: '💳',
  loan: '💰',
  recurring: '🔁',
  trip: '✈️',
};

const addDays = (key: string, n: number) => utcDateKey(new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000));

/** 提醒總覽（2026-11-22）：接下來幾天系統會提醒你的事，全部列在一起。 */
@Injectable()
export class ReminderOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: MemoryService,
    private readonly creditCards: CreditCardService,
    private readonly recurring: FinanceRecurringTransactionsService,
  ) {}

  async upcoming(userId: string, days = 14): Promise<UpcomingReminder[]> {
    const today = taipeiDateKey(new Date());
    const until = addDays(today, days);
    const untilInstant = new Date(Date.parse(`${until}T00:00:00+08:00`));
    const items: UpcomingReminder[] = [];
    const taipeiTime = (d: Date) => {
      const t = new Date(d.getTime() + 8 * 3_600_000);
      return { date: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16) };
    };

    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId }, select: { id: true } });
    const [todos, dates, bills, recurring, loans, trips] = await Promise.all([
      this.prisma.projectTodo.findMany({
        where: {
          personalOwnerUserId: userId,
          done: false,
          OR: [{ remindAt: { lt: untilInstant } }, { dueDateAllDay: false, dueDate: { gte: new Date(), lt: untilInstant } }],
        },
        select: { title: true, remindAt: true, dueDate: true },
      }),
      this.memory.listDates(userId, today),
      space ? this.creditCards.bills(space.id, today).catch(() => []) : [],
      space ? this.recurring.statusForSpace(space.id).catch(() => []) : [],
      space
        ? this.prisma.financeLoan.findMany({
            where: { spaceId: space.id, settled: false, dueDate: { not: null, lt: new Date(`${until}T00:00:00Z`) } },
            select: { counterpartyName: true, direction: true, dueDate: true },
          })
        : [],
      this.prisma.trip.findMany({
        where: { userId, startDate: { gte: new Date(`${today}T00:00:00Z`), lt: new Date(`${until}T00:00:00Z`) } },
        select: { destination: true, startDate: true },
      }),
    ]);

    for (const t of todos) {
      const at = t.remindAt ?? t.dueDate;
      if (!at) continue;
      const { date, time } = taipeiTime(at);
      items.push({ date: date < today ? today : date, time, kind: 'todo', title: t.remindAt ? t.title : `${t.title}（前 1 小時提醒）` });
    }
    for (const d of dates) {
      if (d.next.daysLeft > days) continue;
      items.push({ date: d.next.date, time: null, kind: 'birthday', title: `${d.title}${d.next.years ? `（${d.next.years}）` : ''}` });
    }
    for (const b of bills) {
      if (b.daysLeft < 0 || b.daysLeft > days) continue;
      items.push({ date: b.dueDate, time: null, kind: 'card', title: `${b.name} 繳款日${b.autoPay ? '（自動扣繳）' : ''}` });
    }
    for (const r of recurring) {
      if (r.nextDate > until) continue;
      items.push({ date: r.nextDate, time: '09:00', kind: 'recurring', title: `${r.label}${r.amount == null ? '（提醒）' : '（自動記帳）'}` });
    }
    for (const l of loans) {
      items.push({
        date: utcDateKey(l.dueDate!) < today ? today : utcDateKey(l.dueDate!),
        time: null,
        kind: 'loan',
        title: `${l.counterpartyName} ${l.direction === 'LEND' ? '該還你錢' : '你該還錢'}${utcDateKey(l.dueDate!) < today ? '（已過期）' : ''}`,
      });
    }
    for (const t of trips) items.push({ date: utcDateKey(t.startDate), time: null, kind: 'trip', title: `出發去${t.destination}` });

    return items.sort((a, b) => (a.date + (a.time ?? '99')).localeCompare(b.date + (b.time ?? '99')));
  }

  /** LINE／AI 用的文字版。 */
  async text(userId: string, days = 14): Promise<string> {
    const items = await this.upcoming(userId, days);
    if (items.length === 0) return `🔔 接下來 ${days} 天沒有排好的提醒。`;
    const lines = [`🔔 接下來 ${days} 天會提醒你的事`, ''];
    let lastDate = '';
    for (const i of items) {
      if (i.date !== lastDate) {
        const d = new Date(`${i.date}T00:00:00Z`);
        lines.push(`${lastDate ? '\n' : ''}${d.getUTCMonth() + 1}/${d.getUTCDate()}（${'日一二三四五六'[d.getUTCDay()]}）`);
        lastDate = i.date;
      }
      lines.push(`${KIND_LABEL[i.kind]} ${i.time ? `${i.time} ` : ''}${i.title}`);
    }
    lines.push('', '每天 8 點的早報也會再提醒一次今天的事；要關掉某一類提醒，在 App「提醒設定」或跟我說「關閉早報」。');
    return lines.join('\n');
  }
}

@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class ReminderOverviewController {
  constructor(private readonly overview: ReminderOverviewService) {}

  @Get('upcoming')
  upcoming(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    const n = Math.min(Math.max(Number(days) || 14, 1), 60);
    return this.overview.upcoming(user.id, n);
  }
}
