import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from '../projects/schedule.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { StocksHoldingsService } from '../stocks/stocks-holdings.service';
import { DocumentApprovalsService } from '../document-approvals/document-approvals.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { UpdateHomeLayoutDto } from './dto/update-home-layout.dto';
import { taipeiTodayRange } from '../common/taipei-date';

/** Every widget the home dashboard knows how to show, in the default
 * order — a first-time user (or one who's never touched layout settings)
 * sees exactly this. `HomeService.getLayout` fills in any widget missing
 * from a saved layout (e.g. one added in a later release) at the end, so
 * it's never silently hidden just because it didn't exist when the user
 * last customized their layout. 2026-08-03: added stockSummary/
 * pendingApprovals/ongoingTodos/recentKnowledgeItems for the modules built
 * since the original four (投資, 文件簽核, 代辦事項獨立空間's 持續性任務, 知識庫). */
const DEFAULT_WIDGET_TYPES = [
  'personalFinance',
  'todayFinance',
  'projectSummary',
  'todayTodos',
  'stockSummary',
  'pendingApprovals',
  'ongoingTodos',
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
    private readonly scheduleService: ScheduleService,
    private readonly financeAccountsService: FinanceAccountsService,
    private readonly stocksHoldingsService: StocksHoldingsService,
    private readonly documentApprovalsService: DocumentApprovalsService,
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
    const [personalFinance, projectSummary, todosToday, stockSummary, pendingApprovals, ongoingTodos, recentKnowledgeItems] =
      await Promise.all([
        this.getPersonalFinance(userId),
        this.getProjectSummary(userId),
        this.getTodosToday(userId),
        this.getStockSummary(userId),
        this.documentApprovalsService.pendingForMe(userId),
        this.getOngoingTodos(userId),
        this.getRecentKnowledgeItems(userId),
      ]);
    return {
      personalFinance,
      projectSummary,
      todosToday,
      stockSummary,
      pendingApprovals,
      ongoingTodos,
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

  /** One entry per project with anything relevant today — a project with
   * nothing planned and nothing actually recorded today is left out
   * entirely rather than cluttering the dashboard with idle projects.
   * Public — also reused by `ProjectDigestService`'s evening LINE digest
   * for "today's planned items with no matching actual record yet". */
  async getProjectSummary(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: { include: { space: true } } },
    });

    const { start: todayStart } = todayRange();

    const results: {
      projectId: string;
      projectName: string;
      spaceName: string;
      plannedToday: { id: string; name: string }[];
      actualToday: { id: string; name: string }[];
    }[] = [];

    for (const membership of memberships) {
      const { items, schedule } = await this.scheduleService.buildEditorState(membership.project);
      const parentIds = new Set(items.filter((i) => i.parentId).map((i) => i.parentId as string));
      const leafItems = items.filter((i) => !parentIds.has(i.id));
      const scheduledById = new Map(schedule.tasks.map((t) => [t.workItemId, t]));

      const plannedToday = leafItems.filter((item) => {
        const scheduled = scheduledById.get(item.id);
        if (!scheduled) return false;
        return dateOnly(scheduled.start) <= todayStart && todayStart <= dateOnly(scheduled.end);
      });

      const actualToday = leafItems.filter((item) => {
        if (!item.actualStartDate || item.actualDurationDays == null) return false;
        const start = dateOnly(item.actualStartDate);
        const end = new Date(start.getTime() + (item.actualDurationDays - 1) * 86400000);
        return start <= todayStart && todayStart <= end;
      });

      if (plannedToday.length === 0 && actualToday.length === 0) continue;

      results.push({
        projectId: membership.projectId,
        projectName: membership.project.name,
        spaceName: membership.project.space.name,
        plannedToday: plannedToday.map((i) => ({ id: i.id, name: i.name })),
        actualToday: actualToday.map((i) => ({ id: i.id, name: i.name })),
      });
    }

    return results;
  }

  /** Public — also reused by `TodoDigestService`'s morning/evening LINE
   * digests. Covers both 個人 (personalOwnerUserId = this user) and 工作
   * (any project this user belongs to) todos, combined — `projectName` is
   * `'個人'` for the former. */
  async getTodosToday(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
    });
    const projectIds = memberships.map((m) => m.projectId);
    const projectNameOf = new Map(memberships.map((m) => [m.projectId, m.project.name]));

    const { start: todayStart, end: todayEnd } = todayRange();
    // Bounded to exactly what the two buckets below need (completed today,
    // or still-open with a due date today) — this used to fetch the
    // caller's entire todo history unconditionally and filter in memory,
    // the same unbounded-list bug fixed elsewhere in TodosService.listAll
    // and LineService.sendTodoOverviewAllProjects (see 大系統V1.46.0) —
    // this was the third, previously-missed copy of it.
    const todos = await this.prisma.projectTodo.findMany({
      where: {
        AND: [
          { OR: [{ projectId: { in: projectIds } }, { personalOwnerUserId: userId }] },
          {
            OR: [
              { completedAt: { gte: todayStart, lt: todayEnd } },
              { done: false, dueDate: { gte: todayStart, lt: todayEnd } },
            ],
          },
        ],
      },
    });

    const isSameDay = (d: Date) => d >= todayStart && d < todayEnd;
    const completedToday = todos.filter((t) => t.completedAt && isSameDay(t.completedAt));
    const dueTodayIncomplete = todos.filter((t) => !t.done && t.dueDate && isSameDay(t.dueDate));

    const label = (t: (typeof todos)[number]) => ({
      id: t.id,
      title: t.title,
      projectName: t.projectId ? (projectNameOf.get(t.projectId) ?? '') : '個人',
    });

    return {
      completedToday: completedToday.map(label),
      dueTodayIncomplete: dueTodayIncomplete.map(label),
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

  /** 持續性任務 (isOngoing) across 個人 + every project the user belongs to —
   * unlike getTodosToday, not date-windowed at all (that's the point of
   * this flag: no fixed date to filter on). */
  private async getOngoingTodos(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
    });
    const projectIds = memberships.map((m) => m.projectId);
    const projectNameOf = new Map(memberships.map((m) => [m.projectId, m.project.name]));

    const todos = await this.prisma.projectTodo.findMany({
      where: {
        isOngoing: true,
        done: false,
        OR: [{ projectId: { in: projectIds } }, { personalOwnerUserId: userId }],
      },
      orderBy: { sortOrder: 'asc' },
    });

    return todos.map((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.projectId ? (projectNameOf.get(t.projectId) ?? '') : '個人',
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

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
