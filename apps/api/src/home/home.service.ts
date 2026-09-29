import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { StocksHoldingsService } from '../stocks/stocks-holdings.service';
import { LifeGoalProgressService } from '../life-goals/life-goal-progress.service';
import { FinanceTransactionType, LifeGoalStatus } from '../../generated/prisma/client.js';
import { UpdateHomeLayoutDto } from './dto/update-home-layout.dto';
import { taipeiTodayRange } from '../common/taipei-date';

/** Every widget the home dashboard knows how to show, in the default
 * order — a first-time user (or one who's never touched layout settings)
 * sees exactly this. `HomeService.getLayout` fills in any widget missing
 * from a saved layout (e.g. one added in a later release) at the end, so
 * it's never silently hidden just because it didn't exist when the user
 * last customized their layout. */
const DEFAULT_WIDGET_TYPES = [
  'personalFinance',
  'todayFinance',
  'todayTodos',
  'stockSummary',
  'ongoingTodos',
  'lifeGoals',
  'recentKnowledgeItems',
];

export interface HomeWidgetConfig {
  type: string;
  visible: boolean;
}

/** 2026-08-04: was naive server-local `new Date()` boundaries — wrong for
 * ~8 hours every day since Render's server clock is UTC, not Taiwan time.
 * See `taipeiTodayRange` for the full explanation of the bug this caused. */
const todayRange = taipeiTodayRange;

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccountsService: FinanceAccountsService,
    private readonly stocksHoldingsService: StocksHoldingsService,
    private readonly lifeGoalProgress: LifeGoalProgressService,
  ) {}

  async getLayout(userId: string): Promise<HomeWidgetConfig[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { homeLayoutConfig: true },
    });
    const saved = (user.homeLayoutConfig as { widgets?: HomeWidgetConfig[] } | null)?.widgets ?? [];
    const savedTypes = new Set(saved.map((w) => w.type));
    const missingDefaults = DEFAULT_WIDGET_TYPES.filter((t) => !savedTypes.has(t)).map((type) => ({
      type,
      visible: true,
    }));
    return [...saved, ...missingDefaults];
  }

  async setLayout(userId: string, dto: UpdateHomeLayoutDto): Promise<void> {
    const widgets = dto.widgets.map((w) => ({ type: w.type, visible: w.visible }));
    await this.prisma.user.update({
      where: { id: userId },
      data: { homeLayoutConfig: { widgets } },
    });
  }

  async getDashboard(userId: string) {
    const [personalFinance, todosToday, stockSummary, ongoingTodos, lifeGoals, recentKnowledgeItems] =
      await Promise.all([
        this.getPersonalFinance(userId),
        this.getTodosToday(userId),
        this.getStockSummary(userId),
        this.getOngoingTodos(userId),
        this.getActiveLifeGoals(userId),
        this.getRecentKnowledgeItems(userId),
      ]);
    return {
      personalFinance,
      todosToday,
      stockSummary,
      ongoingTodos,
      lifeGoals,
      recentKnowledgeItems,
    };
  }

  private async getPersonalFinance(userId: string) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) return null;

    const { start, end } = todayRange();
    const [accounts, todayTransactions] = await Promise.all([
      this.financeAccountsService.list(userId, space.id),
      this.prisma.financeTransaction.findMany({
        where: {
          spaceId: space.id,
          date: { gte: start, lt: end },
          type: { in: [FinanceTransactionType.INCOME, FinanceTransactionType.EXPENSE] },
        },
      }),
    ]);

    let todayIncome = 0;
    let todayExpense = 0;
    for (const t of todayTransactions) {
      if (t.type === FinanceTransactionType.INCOME) todayIncome += t.amount;
      else todayExpense += t.amount;
    }

    return {
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.balance })),
      todayIncome,
      todayExpense,
    };
  }

  /** Public — also reused by `TodoDigestService`'s morning/evening LINE
   * digests. */
  async getTodosToday(userId: string) {
    const { start: todayStart, end: todayEnd } = todayRange();
    // Bounded to exactly what the two buckets below need (completed today,
    // or still-open with a due date today) — this used to fetch the
    // caller's entire todo history unconditionally and filter in memory,
    // the same unbounded-list bug fixed elsewhere in TodosService.listAll
    // and LineService.sendTodoOverviewAllProjects (see 大系統V1.46.0).
    const todos = await this.prisma.projectTodo.findMany({
      where: {
        personalOwnerUserId: userId,
        OR: [
          { completedAt: { gte: todayStart, lt: todayEnd } },
          { done: false, dueDate: { lt: todayEnd } },
        ],
      },
    });

    const isSameDay = (d: Date) => d >= todayStart && d < todayEnd;
    const completedToday = todos.filter((t) => t.completedAt && isSameDay(t.completedAt));
    const dueTodayIncomplete = todos.filter((t) => !t.done && t.dueDate && isSameDay(t.dueDate));
    // 逾期未完成 (2026-08-07) — dueDate 早於今天、還沒完成，之前這個查詢
    // 只抓「剛好今天到期」的，過期沒處理的代辦會被整個漏掉，LINE 通知/
    // 代辦事項總覽都看不到，使用者必須自己點進代辦事項空間才會發現。
    const overdueIncomplete = todos.filter((t) => !t.done && t.dueDate && t.dueDate < todayStart);

    const label = (t: (typeof todos)[number]) => ({ id: t.id, title: t.title });

    return {
      completedToday: completedToday.map(label),
      dueTodayIncomplete: dueTodayIncomplete.map(label),
      overdueIncomplete: overdueIncomplete.map(label),
    };
  }

  /** null if the user has no personal space (shouldn't happen in practice —
   * every user gets one at signup) or no stock holdings at all. */
  private async getStockSummary(userId: string) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) return null;

    const holdings = await this.stocksHoldingsService.list(userId, space.id);
    if (holdings.length === 0) return null;

    let totalMarketValue = 0;
    let totalGainLoss = 0;
    let pricesAvailable = true;
    for (const h of holdings) {
      if (h.marketValue == null || h.gainLoss == null) {
        pricesAvailable = false;
        continue;
      }
      totalMarketValue += h.marketValue;
      totalGainLoss += h.gainLoss;
    }

    return {
      totalMarketValue: pricesAvailable ? totalMarketValue : null,
      totalGainLoss: pricesAvailable ? totalGainLoss : null,
      holdings: holdings.map((h) => ({
        stockCode: h.stockCode,
        stockName: h.stockName,
        shares: h.shares,
        marketValue: h.marketValue,
        gainLoss: h.gainLoss,
      })),
    };
  }

  /** 持續性任務 (isOngoing) — unlike getTodosToday, not date-windowed at all
   * (that's the point of this flag: no fixed date to filter on). */
  private async getOngoingTodos(userId: string) {
    const todos = await this.prisma.projectTodo.findMany({
      where: { isOngoing: true, done: false, personalOwnerUserId: userId },
      orderBy: { sortOrder: 'asc' },
    });

    return todos.map((t) => ({ id: t.id, title: t.title }));
  }

  /** Top 5 未完成 人生目標, soonest `targetDate` first (nulls last) — a
   * lightweight preview, not the full `LifeGoalsService.listAll` payload.
   * Progress is resolved the same way the App list does, so auto-tracked
   * goals (帳戶餘額/淨資產/打卡…) show their live number here too. */
  private async getActiveLifeGoals(userId: string) {
    const goals = await this.prisma.lifeGoal.findMany({
      where: { ownerUserId: userId, status: LifeGoalStatus.ACTIVE },
      orderBy: [{ targetDate: 'asc' }, { sortOrder: 'asc' }],
      take: 5,
    });
    const resolved = await this.lifeGoalProgress.resolve(userId, goals);
    return resolved.map((g) => ({
      id: g.id,
      title: g.title,
      targetValue: g.targetValue,
      currentValue: g.currentValue,
      startValue: g.startValue,
      unit: g.unit,
      targetDate: g.targetDate,
    }));
  }

  /** Most recent 5 knowledge items this user owns, regardless of status —
   * a lightweight preview (title/category/status only), not the full
   * field-value payload `KnowledgeItemsService.listOwn` returns. */
  private async getRecentKnowledgeItems(userId: string) {
    const items = await this.prisma.knowledgeItem.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        category: { select: { name: true } },
      },
    });
    return items.map((i) => ({
      id: i.id,
      title: i.title ?? '未命名',
      categoryName: i.category?.name ?? null,
      status: i.status,
      createdAt: i.createdAt,
    }));
  }
}
