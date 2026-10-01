import { decryptSecret } from '../common/secret-box';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { FinanceBudgetsService } from '../finance/finance-budgets.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { LifeGoalsService } from '../life-goals/life-goals.service';
import { formatGoalProgress } from '../life-goals/life-goal-reminder.service';
import { goalProgressFraction } from '../life-goals/life-goal-math';
import { StocksHoldingsService } from '../stocks/stocks-holdings.service';
import { StockHistoryService } from '../stocks/stock-history.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { formatTaipeiDateTime } from '../common/taipei-date';
import { AiUsageStatus, FinanceLoanDirection, FinanceTransactionType, LifeGoalStatus, LifeGoalTrackingType } from '../../generated/prisma/client.js';
import { JournalService } from '../journal/journal.service';
import { FinanceHealthService } from '../finance/finance-health.service';
import { FinanceLoansService } from '../finance/finance-loans.service';
import { FinanceAdvancesService } from '../finance/finance-advances.service';
import { dateKeyString, keyToInstant, ReviewKind, ReviewPeriod, reviewPeriod } from './review-period';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOP_CATEGORIES = 3;
const OWED_STALE_DAYS = 30;
const LIST_MAX = 5;
const UPCOMING_DAYS = 7;
/** 落後判斷：時間過了這麼多比例，進度還差這麼多就算落後。 */
const BEHIND_MARGIN = 0.15;

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
const pct = (now: number, before: number) =>
  before > 0 ? `${now >= before ? '+' : '−'}${Math.round((Math.abs(now - before) / before) * 100)}%` : null;

/** 週／月回顧 (2026-10-01) — 使用者選的：週日 20:00 送週回顧、每月 1 號
 * 09:00 送上個月的月回顧，內容＝錢、事、目標、股票，最後 AI 寫幾句總結與
 * 建議（用使用者自己的 Gemini 金鑰，沒設就只有數字）。LINE 也可以隨時傳
 * 「週回顧」「月回顧」看到目前為止的。 */
@Injectable()
export class LifeReviewService {
  private readonly logger = new Logger(LifeReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: FinanceTransactionsService,
    private readonly budgets: FinanceBudgetsService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly goals: LifeGoalsService,
    private readonly holdings: StocksHoldingsService,
    private readonly history: StockHistoryService,
    private readonly lineNotifier: LineNotifierService,
    private readonly aiUsage: AiUsageService,
    private readonly journal: JournalService,
    private readonly financeHealth: FinanceHealthService,
    private readonly loans: FinanceLoansService,
    private readonly advances: FinanceAdvancesService,
  ) {}

  @Cron('0 20 * * 0', { timeZone: 'Asia/Taipei' })
  async sendWeekly() {
    await this.sendToEveryone('week', false);
  }

  @Cron('0 9 1 * *', { timeZone: 'Asia/Taipei' })
  async sendMonthly() {
    await this.sendToEveryone('month', true);
  }

  private async sendToEveryone(kind: ReviewKind, completedMonth: boolean) {
    const links = await this.prisma.lineAccountLink.findMany({
      where: { lineUserId: { not: null }, reviewEnabled: true },
      select: { userId: true },
    });
    for (const { userId } of links) {
      try {
        const text = await this.build(userId, kind, new Date(), completedMonth);
        if (text) await this.lineNotifier.notifyByUser(userId, text);
      } catch (error) {
        this.logger.error(`${kind === 'week' ? '週' : '月'}回顧失敗（userId=${userId}）`, error as Error);
      }
    }
  }

  /** The full review text, or null when the user has no data at all. */
  async build(userId: string, kind: ReviewKind, now = new Date(), completedMonth = false): Promise<string | null> {
    const period = reviewPeriod(kind, now, completedMonth);
    const [money, owed, tasks, goals, journal, stocks] = await Promise.all([
      this.moneySection(userId, period),
      this.owedSection(userId, period, now),
      this.taskSection(userId, period, now),
      this.goalSection(userId, period, now),
      this.journalSection(userId, period),
      this.stockSection(userId, period),
    ]);
    const sections = [money, owed, tasks, goals, journal, stocks].filter((s): s is Section => s != null);
    if (sections.length === 0) return null;

    const title = `${kind === 'week' ? '📅 週回顧' : '🗓 月回顧'}（${period.label}${period.partial ? '，到今天為止' : ''}）`;
    const body = sections.map((s) => s.text).join('\n\n');
    const summary = await this.aiSummary(userId, period, sections);
    return [title, '', body, ...(summary ? ['', `💬 ${summary}`] : [])].join('\n');
  }

  // --- 錢 ---

  private async moneySection(userId: string, period: ReviewPeriod): Promise<Section | null> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) return null;
    const [current, previous] = await Promise.all([
      this.transactions.rangeSummary(userId, space.id, period.start, period.end),
      this.transactions.rangeSummary(userId, space.id, period.prevStart, period.prevEnd),
    ]);
    if (current.totalIncome === 0 && current.totalExpense === 0 && previous.totalExpense === 0) return null;

    const prevLabel = period.kind === 'week' ? '上週' : '上個月同期';
    const lines = ['💰 錢'];
    const expenseChange = pct(current.totalExpense, previous.totalExpense);
    lines.push(`支出 ${fmt(current.totalExpense)}${expenseChange ? `（比${prevLabel} ${expenseChange}）` : ''}`);
    lines.push(`收入 ${fmt(current.totalIncome)}，結餘 ${signed(current.net)}`);

    const prevByCategory = new Map(
      previous.byCategory.filter((c) => c.kind === FinanceTransactionType.EXPENSE).map((c) => [c.name, c.total]),
    );
    const top = current.byCategory
      .filter((c) => c.kind === FinanceTransactionType.EXPENSE)
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP_CATEGORIES);
    if (top.length > 0) {
      lines.push(
        `花最多：${top
          .map((c) => {
            const change = pct(c.total, prevByCategory.get(c.name) ?? 0);
            return `${c.name} ${fmt(c.total)}${change ? `（${change}）` : ''}`;
          })
          .join('、')}`,
      );
    }

    // 預算看的是「這一期所在的月份」——週回顧就是這個月到目前為止。
    const month = dateKeyString(new Date(period.end.getTime() - MS_PER_DAY)).slice(0, 7);
    const budgetStatus = await this.budgets.monthlyStatus(userId, space.id, month);
    const over = budgetStatus.filter((b) => b.spent > b.monthlyAmount);
    if (over.length > 0) {
      lines.push(`⚠️ ${month.slice(5)} 月預算超支：${over.map((b) => `${b.categoryName} 超 ${fmt(b.spent - b.monthlyAmount)}`).join('、')}`);
    }

    const [startSnap, endSnap] = await Promise.all([
      this.prisma.financeNetWorthSnapshot.findFirst({
        where: { spaceId: space.id, date: { lte: period.start } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.financeNetWorthSnapshot.findFirst({
        where: { spaceId: space.id, date: { lt: period.end } },
        orderBy: { date: 'desc' },
      }),
    ]);
    if (startSnap && endSnap && startSnap.id !== endSnap.id) {
      lines.push(`淨資產 ${fmt(endSnap.netWorth)}（${signed(endSnap.netWorth - startSnap.netWorth)}）`);
    }
    // 財務健檢只放月回顧——分數看的是近 3 個月，每週變化不大。
    const health = period.kind === 'month' ? await this.financeHealth.forSpace(userId, space.id) : null;
    if (health) {
      const weakest = [...health.items].sort((a, b) => a.score / a.max - b.score / b.max)[0];
      lines.push(`🩺 財務健檢 ${health.total} 分（${health.grade}），最該加強：${weakest.label}`);
    }

    return {
      text: lines.join('\n'),
      facts: {
        expense: current.totalExpense,
        previousExpense: previous.totalExpense,
        income: current.totalIncome,
        topCategories: top.map((c) => ({ name: c.name, total: c.total, previous: prevByCategory.get(c.name) ?? 0 })),
        overBudget: over.map((b) => ({ category: b.categoryName, budget: b.monthlyAmount, spent: b.spent })),
        ...(health && { financialHealth: { total: health.total, items: health.items.map((i) => ({ label: i.label, score: i.score, max: i.max, tip: i.tip })) } }),
      },
    };
  }

  // --- 還沒收回的錢（借出超過 30 天、代墊）---

  private async owedSection(userId: string, period: ReviewPeriod, now: Date): Promise<Section | null> {
    if (period.kind !== 'week') return null;
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) return null;
    const [loanPage, advancePage] = await Promise.all([
      this.loans.list(userId, space.id, { settled: false }),
      this.advances.list(userId, space.id, { settled: false }),
    ]);
    const staleBefore = now.getTime() - OWED_STALE_DAYS * MS_PER_DAY;
    const lent = loanPage.items.filter(
      (l) => l.direction === FinanceLoanDirection.LEND && l.initialTransaction && l.initialTransaction.date.getTime() < staleBefore,
    );
    const advances = advancePage.items.filter((a) => a.outstanding > 0);
    if (lent.length === 0 && advances.length === 0) return null;
    const lines = ['💳 還沒收回的錢'];
    for (const l of lent.slice(0, LIST_MAX)) {
      const days = Math.floor((now.getTime() - l.initialTransaction!.date.getTime()) / MS_PER_DAY);
      lines.push(`・${l.counterpartyName} 還欠 ${fmt(l.outstanding)}（借出 ${days} 天）`);
    }
    for (const a of advances.slice(0, LIST_MAX)) lines.push(`・代墊「${a.title}」還沒收回 ${fmt(a.outstanding)}`);
    lines.push('收到了跟我說「小明還我 1000」就會記');
    return {
      text: lines.join('\n'),
      facts: { owedToMe: lent.map((l) => ({ who: l.counterpartyName, amount: l.outstanding })), advances: advances.map((a) => a.outstanding) },
    };
  }

  // --- 事 ---

  private async taskSection(userId: string, period: ReviewPeriod, now: Date): Promise<Section | null> {
    const [completed, overdue, calendarSpace] = await Promise.all([
      this.prisma.projectTodo.findMany({
        where: {
          personalOwnerUserId: userId,
          done: true,
          completedAt: { gte: keyToInstant(period.start), lt: keyToInstant(period.end) },
        },
        select: { title: true },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.projectTodo.findMany({
        where: { personalOwnerUserId: userId, done: false, isOngoing: false, dueDate: { lt: now } },
        select: { title: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } }),
    ]);
    const upcoming =
      period.kind === 'week' && calendarSpace
        ? await this.calendarEvents.list(
            userId,
            calendarSpace.id,
            keyToInstant(period.end).toISOString(),
            new Date(keyToInstant(period.end).getTime() + UPCOMING_DAYS * MS_PER_DAY).toISOString(),
          )
        : [];
    if (completed.length === 0 && overdue.length === 0 && upcoming.length === 0) return null;

    const lines = ['✅ 事'];
    lines.push(
      `完成 ${completed.length} 件代辦${completed.length > 0 ? `：${completed.slice(0, LIST_MAX).map((t) => t.title).join('、')}${completed.length > LIST_MAX ? '…' : ''}` : ''}`,
    );
    if (overdue.length > 0) {
      lines.push(`⏳ 拖著的 ${overdue.length} 件：`);
      for (const t of overdue.slice(0, LIST_MAX)) {
        const days = Math.max(1, Math.floor((now.getTime() - t.dueDate!.getTime()) / MS_PER_DAY));
        lines.push(`・${t.title}（過期 ${days} 天）`);
      }
    }
    if (upcoming.length > 0) {
      lines.push('📌 下週行程：');
      for (const e of upcoming.slice(0, LIST_MAX)) lines.push(`・${formatTaipeiDateTime(e.startAt, e.allDay)} ${e.title}`);
      if (upcoming.length > LIST_MAX) lines.push(`…共 ${upcoming.length} 個`);
    }
    return {
      text: lines.join('\n'),
      facts: {
        completedCount: completed.length,
        overdue: overdue.slice(0, LIST_MAX).map((t) => t.title),
        upcomingCount: upcoming.length,
      },
    };
  }

  // --- 目標 ---

  private async goalSection(userId: string, period: ReviewPeriod, now: Date): Promise<Section | null> {
    const goals = await this.goals.listAll(userId, LifeGoalStatus.ACTIVE);
    if (goals.length === 0) return null;
    const checkIns = await this.prisma.lifeGoalCheckIn.groupBy({
      by: ['goalId'],
      where: { goalId: { in: goals.map((g) => g.id) }, date: { gte: period.start, lt: period.end } },
      _count: { goalId: true },
    });
    const checkInCount = new Map(checkIns.map((c) => [c.goalId, c._count.goalId]));

    const lines = ['🎯 目標'];
    const behind: string[] = [];
    for (const g of goals) {
      const progress = formatGoalProgress(g);
      const count = checkInCount.get(g.id) ?? 0;
      const checkInLabel = g.trackingType === LifeGoalTrackingType.CHECK_IN ? `，這期打卡 ${count} 次` : '';
      lines.push(`・${g.title}${progress ? ` ${progress}` : ''}${checkInLabel}`);

      const fraction = goalProgressFraction(g);
      if (fraction != null && g.targetDate && g.createdAt < now && g.targetDate > g.createdAt) {
        const elapsed = (now.getTime() - g.createdAt.getTime()) / (g.targetDate.getTime() - g.createdAt.getTime());
        if (elapsed - fraction > BEHIND_MARGIN) behind.push(g.title);
      }
    }
    if (behind.length > 0) lines.push(`⚠️ 進度落後：${behind.join('、')}`);
    return {
      text: lines.join('\n'),
      facts: {
        goals: goals.map((g) => ({ title: g.title, progress: formatGoalProgress(g), checkInsThisPeriod: checkInCount.get(g.id) ?? 0 })),
        behind,
      },
    };
  }

  // --- 日記 ---

  private async journalSection(userId: string, period: ReviewPeriod): Promise<Section | null> {
    const stats = await this.journal.stats(userId, period.start, period.end);
    if (stats.entries === 0) return null;
    const mood = stats.averageMood != null ? `，平均心情 ${stats.averageMood}/5 ${MOOD_EMOJI[Math.round(stats.averageMood)]}` : '';
    const tags = stats.topTags.length > 0 ? `
常寫到：${stats.topTags.join('、')}` : '';
    return { text: `📝 日記
寫了 ${stats.days} 天${mood}${tags}`, facts: { journal: stats } };
  }

  // --- 股票 ---

  private async stockSection(userId: string, period: ReviewPeriod): Promise<Section | null> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) return null;
    const holdings = (await this.holdings.list(userId, space.id)).filter((h) => h.marketValue != null);
    if (holdings.length === 0) return null;

    const totalValue = holdings.reduce((sum, h) => sum + h.marketValue!, 0);
    const totalCost = holdings.reduce((sum, h) => sum + h.costBasis, 0);
    // 這期變化＝用期初前最後一個收盤價估算（以現在的股數計，不含期間買賣）。
    const months = period.kind === 'week' ? 2 : 3;
    let periodChange = 0;
    let priced = 0;
    for (const h of holdings) {
      const bars = await this.history.daily(h.stockCode, months);
      const before = [...bars].reverse().find((b) => b.date < dateKeyString(period.start));
      if (!before || h.currentPrice == null) continue;
      periodChange += (h.currentPrice - before.close) * h.shares;
      priced++;
    }

    const lines = ['📈 股票'];
    lines.push(`市值 ${fmt(totalValue)}，總損益 ${signed(totalValue - totalCost)}（${totalCost > 0 ? `${((totalValue - totalCost) / totalCost * 100).toFixed(1)}%` : '—'}）`);
    if (priced > 0) lines.push(`這期變化 ${signed(periodChange)}`);
    const best = [...holdings].sort((a, b) => (b.gainLoss ?? 0) - (a.gainLoss ?? 0));
    if (best.length > 1) {
      lines.push(`賺最多 ${best[0].stockName ?? best[0].stockCode}、最弱 ${best[best.length - 1].stockName ?? best[best.length - 1].stockCode}`);
    }
    return {
      text: lines.join('\n'),
      facts: { marketValue: totalValue, cost: totalCost, periodChange: priced > 0 ? periodChange : null },
    };
  }

  // --- AI 總結 ---

  private async aiSummary(userId: string, period: ReviewPeriod, sections: Section[]): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { geminiApiKey: true } });
    const apiKey = decryptSecret(user?.geminiApiKey);
    if (!apiKey) return null;
    const prompt = [
      `以下是使用者${period.kind === 'week' ? '這週' : period.label}的生活數據（JSON）。`,
      '用繁體中文、像朋友一樣寫 2～3 句總結：先講一個做得好的地方，再點出最值得注意的一件事（例如某分類花太多、代辦拖太久、目標落後），最後給一個下一期可以做的具體小建議。',
      '不要重複列數字清單，不要用 Markdown，總長 100 字以內。',
      JSON.stringify(sections.map((s) => s.facts)),
    ].join('\n');

    const startedAt = Date.now();
    try {
      const client = new GoogleGenAI({ apiKey });
      const interaction = await client.interactions.create({ model: GEMINI_MODEL, input: prompt });
      await this.aiUsage.record({
        userId,
        feature: 'life_review',
        model: GEMINI_MODEL,
        inputTokens: interaction.usage?.total_input_tokens ?? 0,
        outputTokens: interaction.usage?.total_output_tokens ?? 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });
      return interaction.output_text?.trim() || null;
    } catch (error) {
      await this.aiUsage.record({
        userId,
        feature: 'life_review',
        model: GEMINI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(`回顧 AI 總結失敗（userId=${userId}）：${String(error)}`);
      return null;
    }
  }
}

interface Section {
  text: string;
  /** 給 AI 寫總結用的精簡數據。 */
  facts: Record<string, unknown>;
}
