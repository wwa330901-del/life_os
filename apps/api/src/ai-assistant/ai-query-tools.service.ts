import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { FinanceBudgetsService } from '../finance/finance-budgets.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { TodosService } from '../todos/todos.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { taipeiCurrentMonth } from '../common/taipei-date';

/** Gemini Interactions API's tool-declaration shape (`FunctionT` in the SDK
 * — distinct from the older GenerateContent API's `{functionDeclarations:
 * [...]}` wrapper). Every tool here is read-only and scoped to exactly the
 * calling user's own data — no tool ever takes a userId/spaceId parameter
 * from the model, it's always the authenticated caller passed in from
 * outside. 投資/股票 has no tool at all here, by explicit standing
 * instruction — this assistant must never be involved in investment
 * decisions, and simply isn't given the data to reason about them. */
export const AI_QUERY_TOOLS = [
  {
    type: 'function' as const,
    name: 'get_finance_overview',
    description:
      '取得指定月份的記帳總覽：本月收入/支出/結餘、各分類（母分類）的收支總額、以及每個有設定預算的分類的預算vs已花費。',
    parameters: {
      type: 'object',
      properties: {
        month: { type: 'string', description: '格式 "YYYY-MM"，不填則預設當月' },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'list_finance_transactions',
    description: '列出指定月份的記帳明細（最新在前），可選擇只看某個分類或某種類型（收入/支出/轉帳）。',
    parameters: {
      type: 'object',
      properties: {
        month: { type: 'string', description: '格式 "YYYY-MM"，不填則預設當月' },
        categoryName: { type: 'string', description: '只看這個分類名稱（子分類或母分類皆可，模糊比對）' },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE', 'TRANSFER'] },
        limit: { type: 'integer', description: '最多回傳幾筆，預設20' },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'list_todos',
    description: '列出使用者的代辦事項，可依狀態篩選。',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'done', 'ongoing', 'all'],
          description: 'pending=尚未完成且非持續性任務, done=已完成, ongoing=持續性任務, all=全部，預設 pending',
        },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'list_calendar_events',
    description: '列出使用者行事曆空間裡指定日期範圍的事件，不填日期則預設今天起未來30天。',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: '格式 "YYYY-MM-DD"' },
        endDate: { type: 'string', description: '格式 "YYYY-MM-DD"' },
      },
    },
  },
];

type ToolArgs = Record<string, unknown>;

@Injectable()
export class AiQueryToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeTransactions: FinanceTransactionsService,
    private readonly financeBudgets: FinanceBudgetsService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly todosService: TodosService,
  ) {}

  /** Dispatches one Gemini function-call step to the matching handler —
   * throws for an unknown name so the caller can surface an is_error
   * function_result back to the model rather than silently returning
   * nothing. */
  async execute(userId: string, name: string, args: ToolArgs): Promise<unknown> {
    switch (name) {
      case 'get_finance_overview':
        return this.getFinanceOverview(userId, args);
      case 'list_finance_transactions':
        return this.listFinanceTransactions(userId, args);
      case 'list_todos':
        return this.listTodos(userId, args);
      case 'list_calendar_events':
        return this.listCalendarEvents(userId, args);
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }

  private async personalSpaceId(userId: string): Promise<string | null> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    return space?.id ?? null;
  }

  private async getFinanceOverview(userId: string, args: ToolArgs) {
    const spaceId = await this.personalSpaceId(userId);
    if (!spaceId) return { error: '這個使用者還沒有個人空間' };
    const month = typeof args.month === 'string' ? args.month : taipeiCurrentMonth();
    const [summary, budgetStatus] = await Promise.all([
      this.financeTransactions.monthlySummary(userId, spaceId, month),
      this.financeBudgets.monthlyStatus(userId, spaceId, month),
    ]);
    return {
      month,
      totalIncome: summary.totalIncome,
      totalExpense: summary.totalExpense,
      net: summary.net,
      byCategory: summary.byCategory.map((c) => ({ name: c.name, kind: c.kind, total: c.total })),
      budgets: budgetStatus.map((b) => ({
        categoryName: b.categoryName,
        monthlyAmount: b.monthlyAmount,
        spent: b.spent,
      })),
    };
  }

  private async listFinanceTransactions(userId: string, args: ToolArgs) {
    const spaceId = await this.personalSpaceId(userId);
    if (!spaceId) return { error: '這個使用者還沒有個人空間' };
    const month = typeof args.month === 'string' ? args.month : taipeiCurrentMonth();
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 20;
    const type = typeof args.type === 'string' ? (args.type as FinanceTransactionType) : null;
    const categoryName = typeof args.categoryName === 'string' ? args.categoryName.trim() : null;

    const transactions = await this.prisma.financeTransaction.findMany({
      where: {
        spaceId,
        date: { gte: monthRange(month).start, lt: monthRange(month).end },
        ...(type && { type }),
      },
      include: { category: true, account: true },
      orderBy: { date: 'desc' },
      take: 100,
    });

    const filtered = categoryName
      ? transactions.filter((t) => t.category?.name.includes(categoryName))
      : transactions;

    return filtered.slice(0, limit).map((t) => ({
      date: t.date.toISOString().slice(0, 10),
      type: t.type,
      amount: t.amount,
      categoryName: t.category?.name ?? null,
      accountName: t.account?.name ?? null,
      note: t.note ?? null,
    }));
  }

  private async listTodos(userId: string, args: ToolArgs) {
    const status = typeof args.status === 'string' ? args.status : 'pending';
    const { personal } = await this.todosService.listAll(userId);

    const matches = (t: (typeof personal)[number]) => {
      switch (status) {
        case 'done':
          return t.done;
        case 'ongoing':
          return t.isOngoing && !t.done;
        case 'all':
          return true;
        case 'pending':
        default:
          return !t.done && !t.isOngoing;
      }
    };

    return personal.filter(matches).map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      isOngoing: t.isOngoing,
      done: t.done,
    }));
  }

  private async listCalendarEvents(userId: string, args: ToolArgs) {
    const space = await this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } });
    if (!space) return { error: '這個使用者還沒有行事曆空間' };
    const now = new Date();
    const startDate = typeof args.startDate === 'string' ? args.startDate : now.toISOString().slice(0, 10);
    const endDate =
      typeof args.endDate === 'string'
        ? args.endDate
        : new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const events = await this.calendarEvents.list(userId, space.id, startDate, endDate);
    return events.map((e) => ({
      title: e.title,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt ? e.endAt.toISOString() : null,
      allDay: e.allDay,
      location: e.location ?? null,
    }));
  }
}

function monthRange(month: string): { start: Date; end: Date } {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1));
  const end = new Date(Date.UTC(year, m, 1));
  return { start, end };
}
