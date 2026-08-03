import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from '../projects/schedule.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { UpdateHomeLayoutDto } from './dto/update-home-layout.dto';

/** Every widget the home dashboard knows how to show, in the default
 * order — a first-time user (or one who's never touched layout settings)
 * sees exactly this. `HomeService.getLayout` fills in any widget missing
 * from a saved layout (e.g. one added in a later release) at the end, so
 * it's never silently hidden just because it didn't exist when the user
 * last customized their layout. */
const DEFAULT_WIDGET_TYPES = ['personalFinance', 'todayFinance', 'projectSummary', 'todayTodos'];

export interface HomeWidgetConfig {
  type: string;
  visible: boolean;
}

function todayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly financeAccountsService: FinanceAccountsService,
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
    const [personalFinance, projectSummary, todosToday] = await Promise.all([
      this.getPersonalFinance(userId),
      this.getProjectSummary(userId),
      this.getTodosToday(userId),
    ]);
    return { personalFinance, projectSummary, todosToday };
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

  /** Public — also reused by `TodoDigestService`'s morning/evening LINE digests. */
  async getTodosToday(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
    });
    const projectIds = memberships.map((m) => m.projectId);
    const projectNameOf = new Map(memberships.map((m) => [m.projectId, m.project.name]));

    const { start: todayStart, end: todayEnd } = todayRange();
    const todos = await this.prisma.projectTodo.findMany({
      where: { projectId: { in: projectIds } },
    });

    const isSameDay = (d: Date) => d >= todayStart && d < todayEnd;
    const completedToday = todos.filter((t) => t.completedAt && isSameDay(t.completedAt));
    const dueTodayIncomplete = todos.filter((t) => !t.done && t.dueDate && isSameDay(t.dueDate));

    const label = (t: (typeof todos)[number]) => ({
      id: t.id,
      title: t.title,
      projectName: projectNameOf.get(t.projectId) ?? '',
    });

    return {
      completedToday: completedToday.map(label),
      dueTodayIncomplete: dueTodayIncomplete.map(label),
    };
  }
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
