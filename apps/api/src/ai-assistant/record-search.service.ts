import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { utcDateKey } from '../common/taipei-date';

/** 跨類搜尋（2026-11-22，健檢「記得進去但找不回來」）：一個關鍵字同時找記帳、代辦、
 * 行程、日記、記住的事、知識庫、借貸代墊、目標打卡、旅行，新到舊。 */
export const RECORD_SEARCH_TOOL = {
  type: 'function' as const,
  name: 'search_records',
  description:
    '跨類搜尋使用者以前記過的東西：記帳（備註、分類）、代辦（含做完的）、行程、日記、記住的事、知識庫收藏、借貸對象、代墊、人生目標打卡的備註、旅行。' +
    '問「上次…是什麼時候」「我有沒有記過…」「…多少錢」「之前那個…」這種找回過去的問題先用這個。keyword 放最關鍵的一兩個字（例如「機油」「牙醫」「小明」），找不到可以換同義詞再找一次。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '要找的字，越短越好，例如「機油」' },
      since: { type: 'string', description: '只找這天以後的，YYYY-MM-DD，不填＝全部' },
    },
    required: ['keyword'],
  },
};

const PER_TYPE = 8;

function snippet(text: string, keyword: string, width = 40): string {
  const i = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (i < 0 || text.length <= width * 2) return text.slice(0, width * 2);
  const start = Math.max(0, i - width);
  return `${start > 0 ? '…' : ''}${text.slice(start, i + keyword.length + width)}${i + keyword.length + width < text.length ? '…' : ''}`;
}

@Injectable()
export class RecordSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, keywordRaw: unknown, sinceRaw?: unknown) {
    const keyword = typeof keywordRaw === 'string' ? keywordRaw.trim() : '';
    if (!keyword) throw new Error('要給 keyword');
    const since = typeof sinceRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? new Date(`${sinceRaw}T00:00:00Z`) : undefined;
    const has = { contains: keyword, mode: 'insensitive' as const };
    const [personal, calendar] = await Promise.all([
      this.prisma.space.findUnique({ where: { ownerUserId: userId }, select: { id: true } }),
      this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId }, select: { id: true } }),
    ]);

    const [transactions, todos, events, journals, memories, knowledge, loans, advances, checkIns, trips] = await Promise.all([
      personal
        ? this.prisma.financeTransaction.findMany({
            where: { spaceId: personal.id, ...(since && { date: { gte: since } }), OR: [{ note: has }, { category: { name: has } }] },
            orderBy: { date: 'desc' },
            take: PER_TYPE,
            include: { category: { select: { name: true } }, account: { select: { name: true } } },
          })
        : [],
      this.prisma.projectTodo.findMany({
        where: { personalOwnerUserId: userId, ...(since && { createdAt: { gte: since } }), OR: [{ title: has }, { notes: has }] },
        orderBy: { createdAt: 'desc' },
        take: PER_TYPE,
      }),
      calendar
        ? this.prisma.calendarEvent.findMany({
            where: { spaceId: calendar.id, ...(since && { startAt: { gte: since } }), OR: [{ title: has }, { location: has }, { notes: has }] },
            orderBy: { startAt: 'desc' },
            take: PER_TYPE,
          })
        : [],
      this.prisma.journalEntry.findMany({
        where: { ownerUserId: userId, content: has, ...(since && { date: { gte: since } }) },
        orderBy: { date: 'desc' },
        take: PER_TYPE,
      }),
      this.prisma.userMemory.findMany({ where: { ownerUserId: userId, content: has }, orderBy: { createdAt: 'desc' }, take: PER_TYPE }),
      this.prisma.knowledgeItem.findMany({
        where: { ownerUserId: userId, ...(since && { createdAt: { gte: since } }), OR: [{ title: has }, { summary: has }] },
        orderBy: { createdAt: 'desc' },
        take: PER_TYPE,
      }),
      personal
        ? this.prisma.financeLoan.findMany({ where: { spaceId: personal.id, counterpartyName: has }, orderBy: { createdAt: 'desc' }, take: PER_TYPE })
        : [],
      personal
        ? this.prisma.financeAdvance.findMany({ where: { spaceId: personal.id, title: has }, orderBy: { createdAt: 'desc' }, take: PER_TYPE })
        : [],
      this.prisma.lifeGoalCheckIn.findMany({
        where: { goal: { ownerUserId: userId }, note: has, ...(since && { date: { gte: since } }) },
        orderBy: { date: 'desc' },
        take: PER_TYPE,
        include: { goal: { select: { title: true } } },
      }),
      this.prisma.trip.findMany({ where: { userId, destination: has }, orderBy: { startDate: 'desc' }, take: PER_TYPE }),
    ]);

    const results = {
      transactions: transactions.map((t) => ({
        date: utcDateKey(t.date),
        type: t.type,
        amount: t.amount,
        category: t.category?.name ?? null,
        account: t.account.name,
        note: t.note,
      })),
      todos: todos.map((t) => ({
        title: t.title,
        done: t.done,
        completedAt: t.completedAt?.toISOString() ?? null,
        dueDate: t.dueDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      calendarEvents: events.map((e) => ({ title: e.title, startAt: e.startAt.toISOString(), location: e.location })),
      journal: journals.map((j) => ({ date: utcDateKey(j.date), text: snippet(j.content, keyword) })),
      memories: memories.map((m) => ({ text: m.content, savedAt: m.createdAt.toISOString() })),
      knowledge: knowledge.map((k) => ({ title: k.title, summary: k.summary ? snippet(k.summary, keyword) : null, savedAt: k.createdAt.toISOString() })),
      loans: loans.map((l) => ({ who: l.counterpartyName, direction: l.direction, createdAt: l.createdAt.toISOString() })),
      advances: advances.map((a) => ({ title: a.title, createdAt: a.createdAt.toISOString() })),
      goalCheckIns: checkIns.map((c) => ({ goal: c.goal.title, date: utcDateKey(c.date), note: c.note })),
      trips: trips.map((t) => ({ destination: t.destination, startDate: utcDateKey(t.startDate) })),
    };
    const total = Object.values(results).reduce((n, list) => n + list.length, 0);
    return {
      keyword,
      total,
      ...(total === 0 && { hint: '都找不到，可以換個說法（同義詞、更短的字）再找一次，或問使用者大概是什麼時候。' }),
      ...Object.fromEntries(Object.entries(results).filter(([, list]) => list.length > 0)),
    };
  }
}
