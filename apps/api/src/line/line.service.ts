import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import {
  FinanceAccountType,
  FinanceCategoryKind,
  FinanceTransactionType,
} from '../../generated/prisma/client.js';

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
  postback?: { data?: string };
}

interface QuickReplyItem {
  label: string;
  data: string;
}

/** A LINE-command separator can be whitespace, common punctuation, or
 * nothing at all (fields typed glued together) — this app's users wanted
 * the parser to be lenient rather than making them remember an exact
 * delimiter, so every free-text command strips these opportunistically
 * instead of splitting on them. */
const SEPARATORS = /[\s\-+*/,，、]+/;
const LEADING_SEPARATORS = new RegExp(`^${SEPARATORS.source}`);
const EDGE_SEPARATORS = new RegExp(`^${SEPARATORS.source}|${SEPARATORS.source}$`, 'g');

const LINK_CODE_TTL_MINUTES = 10;
/** LINE caps a message's quickReply.items at 13. */
const MAX_QUICK_REPLY_ITEMS = 13;

/**
 * Backs the LINE bot behind 元序's 記帳/財務總覽/代辦事項/行事曆 features:
 * verifying LINE's webhook signature, linking a LINE account to a life_os
 * user (via a short-lived code generated in the app), and handling four
 * kinds of commands — all single-shot free text, no multi-step
 * button-driven flow (an earlier version drove 記帳 through a
 * dynamically-generated, per-user LINE Rich Menu; that had to be dropped
 * because Render's Linux runtime has no CJK font, so any Chinese text
 * rendered into a rich-menu image server-side came out as tofu/garbled
 * boxes — LINE's own quick-reply buttons and the one static, locally-
 * rendered main menu are unaffected since LINE's client renders those,
 * not us):
 *
 * - 記帳: "支出 300 午餐 現金" (or "支出-300-午餐-現金", or glued together
 *   "支出300午餐現金" — see `parseFinanceCommand`), tapping the 記帳 button
 *   just replies with the format + the space's actual category/account
 *   names so there's something to type.
 * - 財務總覽: balances + today's/this month's totals.
 * - 代辦事項 / 代辦事項總覽: "新增 XXX" still needs a target project
 *   (`activeProjectId`, picked once via quick-reply when ambiguous, same
 *   as before), but "完成 N" now references the Nth item of whichever list
 *   was shown last (`LineAccountLink.lastTodoListIds`) instead of matching
 *   by typed title — titles typed while completing something often don't
 *   match what was typed when it was created.
 * - 新增行事曆: see `parseCalendarCommand`.
 *
 * Writes go straight through Prisma rather than the HTTP-facing
 * `Finance*Service`/`ProjectTodosService` layer (built around "an
 * authenticated user acting on their own space via the app's own
 * endpoints") since this is a different trust boundary — the caller here
 * is LINE itself, authenticated by HMAC signature rather than a JWT,
 * already resolved down to a specific `userId` by the time any write
 * happens. Reads (財務總覽) and calendar writes do reuse the HTTP-facing
 * services directly — no access-boundary reason not to, and it keeps that
 * logic in exactly one place instead of a second copy drifting out of
 * sync.
 */
@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name);
  private readonly channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';
  private readonly channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccountsService: FinanceAccountsService,
    private readonly financeTransactionsService: FinanceTransactionsService,
    private readonly calendarEventsService: CalendarEventsService,
  ) {}

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !this.channelSecret) return false;
    const expected = crypto.createHmac('sha256', this.channelSecret).update(rawBody).digest('base64');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  async generateLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000);
    await this.prisma.lineAccountLink.upsert({
      where: { userId },
      create: { userId, linkCode: code, linkCodeExpiresAt: expiresAt },
      update: { linkCode: code, linkCodeExpiresAt: expiresAt },
    });
    return { code, expiresAt };
  }

  async handleEvents(events: LineWebhookEvent[]): Promise<void> {
    for (const event of events) {
      const lineUserId = event.source?.userId;
      const replyToken = event.replyToken;
      if (!lineUserId || !replyToken) continue;

      try {
        const link = await this.prisma.lineAccountLink.findUnique({ where: { lineUserId } });

        if (event.type === 'postback' && event.postback?.data) {
          if (!link) continue;
          await this.handlePostback(link.id, event.postback.data, replyToken);
          continue;
        }

        if (event.type !== 'message' || event.message?.type !== 'text') continue;
        const text = event.message.text?.trim();
        if (!text) continue;

        if (link) {
          await this.handleTextForLinkedUser(link.id, link.userId, link.activeProjectId, text, replyToken);
        } else {
          await this.tryCompleteLinking(lineUserId, text, replyToken);
        }
      } catch (error) {
        this.logger.error('Failed to handle LINE event', error);
      }
    }
  }

  private async tryCompleteLinking(lineUserId: string, code: string, replyToken: string) {
    const pending = await this.prisma.lineAccountLink.findUnique({ where: { linkCode: code } });
    if (!pending || !pending.linkCodeExpiresAt || pending.linkCodeExpiresAt < new Date()) {
      await this.reply(replyToken, '綁定碼無效或已過期，請到元序 App 的記帳頁重新產生一組綁定碼。');
      return;
    }
    await this.prisma.lineAccountLink.update({
      where: { id: pending.id },
      data: { lineUserId, linkCode: null, linkCodeExpiresAt: null },
    });
    await this.reply(
      replyToken,
      '綁定成功！點下面選單試試看：記帳／財務總覽／代辦事項／代辦事項總覽，或直接傳「新增行事曆 7/31 14:00 開會 @地點」。',
    );
  }

  /** The only postback left in use is the project picker for 代辦事項
   * (LINE's own quick-reply buttons — plain text UI, not a rendered image,
   * so it never hit the CJK-font rendering problem the old rich-menu flow
   * had). */
  private async handlePostback(linkId: string, data: string, replyToken: string) {
    const [key, value] = data.split(':');
    if (key === 'proj') {
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { activeProjectId: value } });
      await this.sendTodoHelp(linkId, value, replyToken);
    }
  }

  // --- Routing ---

  private static readonly OVERVIEW_KEYWORDS = ['財務總覽', '總覽', '總覽財務'];
  private static readonly TODO_ENTRY_KEYWORDS = ['代辦事項', '代辦', '待辦事項', '待辦'];

  private async handleTextForLinkedUser(
    linkId: string,
    userId: string,
    activeProjectId: string | null,
    text: string,
    replyToken: string,
  ) {
    if (text === '記帳') {
      await this.sendFinanceHelp(userId, replyToken);
      return;
    }
    if (LineService.OVERVIEW_KEYWORDS.includes(text)) {
      await this.sendOverview(userId, replyToken);
      return;
    }
    if (text === '代辦事項總覽') {
      await this.sendTodoOverviewAllProjects(linkId, userId, replyToken);
      return;
    }
    if (LineService.TODO_ENTRY_KEYWORDS.includes(text)) {
      await this.enterTodoFlow(linkId, userId, activeProjectId, replyToken);
      return;
    }
    if (text === '切換專案') {
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { activeProjectId: null } });
      await this.enterTodoFlow(linkId, userId, null, replyToken);
      return;
    }
    if (text.startsWith('新增行事曆')) {
      await this.createCalendarEventFromText(userId, text, replyToken);
      return;
    }
    if (text.startsWith('新增')) {
      await this.createTodoFromText(activeProjectId, text, replyToken);
      return;
    }
    if (text.startsWith('完成')) {
      await this.completeTodoByNumber(linkId, text, replyToken);
      return;
    }

    if (await this.tryFinanceCommand(userId, text, replyToken)) return;

    await this.reply(
      replyToken,
      [
        '看不懂這個指令，可以試試：',
        '・記帳：例如「支出 300 午餐 現金」（傳「記帳」看完整格式跟你的分類/帳戶）',
        '・財務總覽',
        '・代辦事項 / 代辦事項總覽',
        '・新增行事曆 7/31 14:00 開會 @地點',
      ].join('\n'),
    );
  }

  // --- 記帳 ---

  private async sendFinanceHelp(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    const [categories, accounts] = await Promise.all([
      this.prisma.financeCategory.findMany({ where: { spaceId: space.id }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.financeAccount.findMany({ where: { spaceId: space.id }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const expenseCats = this.formatCategoryOptions(categories, FinanceCategoryKind.EXPENSE);
    const incomeCats = this.formatCategoryOptions(categories, FinanceCategoryKind.INCOME);

    await this.reply(
      replyToken,
      [
        '💰 記帳',
        '例如「支出300午餐現金」',
        '',
        `支出分類：${expenseCats}`,
        `收入分類：${incomeCats}`,
        `帳戶：${accounts.length ? accounts.map((a) => a.name).join('、') : '（還沒有，請到 App 新增）'}`,
      ].join('\n'),
    );
  }

  /** Categories that can actually be recorded against directly — a 母分類
   * with children can't (the child is the real classification), so it's
   * excluded; everything else (a childless top-level category, or a
   * 子分類 itself) is a leaf. */
  private leafCategories<T extends { id: string; parentId: string | null }>(categories: T[]): T[] {
    const parentIds = new Set(categories.filter((c) => c.parentId).map((c) => c.parentId!));
    return categories.filter((c) => !parentIds.has(c.id));
  }

  /** "分類、母分類（子1、子2）、..." — every 母分類 shows its 子分類 in
   * parentheses right after it so the LINE reply reflects the same
   * hierarchy as the app, instead of a flat list of leaf names that hides
   * which children belong under which parent. */
  private formatCategoryOptions(
    categories: { id: string; name: string; kind: FinanceCategoryKind; parentId: string | null }[],
    kind: FinanceCategoryKind,
  ): string {
    const ofKind = categories.filter((c) => c.kind === kind);
    const topLevel = ofKind.filter((c) => !c.parentId);
    const parts = topLevel.map((c) => {
      const children = ofKind.filter((child) => child.parentId === c.id).map((child) => child.name);
      return children.length ? `${c.name}（${children.join('、')}）` : c.name;
    });
    return parts.length ? parts.join('、') : '（還沒有，請到 App 新增）';
  }

  /** Returns true once it's decided this text *was* a 記帳 command attempt
   * (even if parsing failed, in which case it already sent an error reply)
   * — false only means "not a 記帳 command at all", so the caller can keep
   * trying other interpretations. */
  private async tryFinanceCommand(userId: string, text: string, replyToken: string): Promise<boolean> {
    if (!text.startsWith('支出') && !text.startsWith('收入')) return false;

    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }
    const [categories, accounts] = await Promise.all([
      this.prisma.financeCategory.findMany({ where: { spaceId: space.id } }),
      this.prisma.financeAccount.findMany({ where: { spaceId: space.id }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const parsed = this.parseFinanceCommand(text, this.leafCategories(categories), accounts);
    if (!parsed) {
      await this.reply(replyToken, '看不懂記帳格式，傳「記帳」看範例跟目前可用的分類/帳戶。');
      return true;
    }

    const accountId = parsed.accountId ?? accounts[0]?.id;
    if (!accountId) {
      await this.reply(replyToken, '你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }

    await this.prisma.financeTransaction.create({
      data: {
        spaceId: space.id,
        type: parsed.type,
        amount: parsed.amount,
        accountId,
        categoryId: parsed.categoryId,
        date: new Date(),
        note: parsed.note,
      },
    });

    const account = accounts.find((a) => a.id === accountId);
    const category = parsed.categoryId ? categories.find((c) => c.id === parsed.categoryId) : null;
    const typeLabel = parsed.type === FinanceTransactionType.INCOME ? '收入' : '支出';
    await this.reply(
      replyToken,
      `已記錄${typeLabel} ${parsed.amount.toLocaleString('en-US')}（${category?.name ?? '未分類'} · ${account?.name ?? ''}）${parsed.note ? ' · ' + parsed.note : ''}`,
    );
    return true;
  }

  /** "支出/收入 金額 分類 帳戶 備註" — every gap may be any mix of
   * whitespace/punctuation or nothing at all. Amount is extracted as the
   * digit run right after the type keyword; 分類/帳戶 are found by
   * scanning the space's own category/account names as substrings
   * (longest name first, so e.g. a category "早餐" wins over a shorter
   * unrelated "餐" if both existed) rather than by position — this is what
   * makes zero-separator input parseable at all, and incidentally is also
   * what fixes the older one-line command's "分類會變成備註" complaint
   * without needing a multi-step flow. Whatever's left becomes the note. */
  private parseFinanceCommand(
    text: string,
    categories: { id: string; name: string; kind: FinanceCategoryKind }[],
    accounts: { id: string; name: string }[],
  ): {
    type: FinanceTransactionType;
    amount: number;
    categoryId: string | null;
    accountId: string | null;
    note: string | null;
  } | null {
    let rest = text.trim();
    let type: FinanceTransactionType;
    if (rest.startsWith('支出')) {
      type = FinanceTransactionType.EXPENSE;
      rest = rest.slice(2);
    } else if (rest.startsWith('收入')) {
      type = FinanceTransactionType.INCOME;
      rest = rest.slice(2);
    } else {
      return null;
    }
    rest = rest.replace(LEADING_SEPARATORS, '');

    const amountMatch = rest.match(/^\d+(\.\d+)?/);
    if (!amountMatch) return null;
    const amount = Number(amountMatch[0]);
    if (!(amount > 0)) return null;
    rest = rest.slice(amountMatch[0].length).replace(LEADING_SEPARATORS, '');

    const kind = type === FinanceTransactionType.INCOME ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE;
    let categoryId: string | null = null;
    for (const c of categories.filter((c) => c.kind === kind).sort((a, b) => b.name.length - a.name.length)) {
      const idx = rest.indexOf(c.name);
      if (idx !== -1) {
        categoryId = c.id;
        rest = rest.slice(0, idx) + rest.slice(idx + c.name.length);
        break;
      }
    }

    let accountId: string | null = null;
    for (const a of [...accounts].sort((x, y) => y.name.length - x.name.length)) {
      const idx = rest.indexOf(a.name);
      if (idx !== -1) {
        accountId = a.id;
        rest = rest.slice(0, idx) + rest.slice(idx + a.name.length);
        break;
      }
    }

    const note = rest.replace(EDGE_SEPARATORS, '').trim() || null;
    return { type, amount, categoryId, accountId, note };
  }

  /** 個人財務總覽：every account's current balance, today's and this
   * month's income/expense totals, and this month's expense breakdown by
   * category — everything reused from the same services the app's own
   * finance screens call, just formatted as one text reply. */
  private async sendOverview(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [accounts, monthSummary, todayTransactions] = await Promise.all([
      this.financeAccountsService.list(userId, space.id),
      this.financeTransactionsService.monthlySummary(userId, space.id, month),
      this.prisma.financeTransaction.findMany({
        where: {
          spaceId: space.id,
          date: { gte: todayStart, lt: todayEnd },
          type: { in: [FinanceTransactionType.INCOME, FinanceTransactionType.EXPENSE] },
        },
      }),
    ]);

    const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
    const todayIncome = todayTransactions
      .filter((t) => t.type === FinanceTransactionType.INCOME)
      .reduce((sum, t) => sum + t.amount, 0);
    const todayExpense = todayTransactions
      .filter((t) => t.type === FinanceTransactionType.EXPENSE)
      .reduce((sum, t) => sum + t.amount, 0);

    const lines: string[] = ['📊 財務總覽', ''];

    lines.push('帳戶餘額：');
    if (accounts.length === 0) {
      lines.push('（還沒有任何帳戶）');
    } else {
      for (const a of accounts) {
        const isDebt = a.type === FinanceAccountType.CREDIT_CARD && a.balance < 0;
        lines.push(`・${a.name}：${isDebt ? `欠款 ${fmt(-a.balance)}` : fmt(a.balance)}`);
      }
    }

    lines.push('', `今日：收入 ${fmt(todayIncome)} · 支出 ${fmt(todayExpense)}`);
    lines.push(`本月：收入 ${fmt(monthSummary.totalIncome)} · 支出 ${fmt(monthSummary.totalExpense)}`);

    const expenseCategories = monthSummary.byCategory
      .filter((c) => c.kind === FinanceTransactionType.EXPENSE)
      .sort((a, b) => b.total - a.total);
    if (expenseCategories.length > 0) {
      lines.push('', '本月支出分類佔比：');
      for (const c of expenseCategories) {
        const pct =
          monthSummary.totalExpense > 0 ? Math.round((c.total / monthSummary.totalExpense) * 100) : 0;
        lines.push(`・${c.name} ${pct}%（${fmt(c.total)}）`);
      }
    }

    await this.reply(replyToken, lines.join('\n'));
  }

  // --- 專案代辦事項 ---

  /** No active project yet → list the user's projects as quick-reply
   * buttons to pick one (auto-picks if there's only one); otherwise shows
   * that project's 代辦事項 format reminder + numbered list directly. */
  private async enterTodoFlow(
    linkId: string,
    userId: string,
    activeProjectId: string | null,
    replyToken: string,
  ) {
    if (activeProjectId) {
      await this.sendTodoHelp(linkId, activeProjectId, replyToken);
      return;
    }

    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_QUICK_REPLY_ITEMS - 1,
    });
    if (memberships.length === 0) {
      await this.reply(replyToken, '你目前不是任何專案的成員，代辦事項功能需要先加入一個專案。');
      return;
    }
    if (memberships.length === 1) {
      const projectId = memberships[0].project.id;
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { activeProjectId: projectId } });
      await this.sendTodoHelp(linkId, projectId, replyToken);
      return;
    }
    await this.replyWithQuickReply(
      replyToken,
      '要記哪個專案的代辦事項？',
      memberships.map((m) => ({ label: m.project.name.slice(0, 20), data: `proj:${m.project.id}` })),
    );
  }

  /** Format reminder + the active project's incomplete todos, numbered —
   * those numbers are what "完成 N" resolves against next. */
  private async sendTodoHelp(linkId: string, projectId: string, replyToken: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      await this.reply(replyToken, '這個專案好像不存在了，傳「切換專案」重新選一個。');
      return;
    }
    const incomplete = await this.prisma.projectTodo.findMany({
      where: { projectId, done: false },
      orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    });
    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { lastTodoListIds: incomplete.map((t) => t.id) },
    });

    const lines = [
      `✅ 代辦事項（${project.name}）`,
      '',
      '新增：新增 項目內容　例如「新增 買材料」',
      '完成：完成 編號　例如「完成 2」',
      '',
      `未完成清單（${incomplete.length}）：`,
    ];
    lines.push(
      ...(incomplete.length
        ? incomplete.map(
            (t, i) => `${i + 1}. ${t.title}${t.dueDate ? `（${t.dueDate.getMonth() + 1}/${t.dueDate.getDate()}）` : ''}`,
          )
        : ['（目前沒有未完成的代辦事項）']),
    );
    lines.push('', '傳「代辦事項總覽」看所有專案今天的狀況，傳「切換專案」換專案。');
    await this.reply(replyToken, lines.join('\n'));
  }

  /** 今日已完成（所有專案合併顯示，不用選）、今日到期還沒完成、未來 7 天內到
   * 期 —— 未完成的兩組會連續編號，供「完成 N」使用；已完成的只是列出來看，
   * 沒有編號（沒有可以「完成」的動作）。 */
  private async sendTodoOverviewAllProjects(linkId: string, userId: string, replyToken: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
    });
    if (memberships.length === 0) {
      await this.reply(replyToken, '你目前不是任何專案的成員，代辦事項功能需要先加入一個專案。');
      return;
    }
    const projectIds = memberships.map((m) => m.projectId);
    const projectNameOf = new Map(memberships.map((m) => [m.projectId, m.project.name]));

    const todos = await this.prisma.projectTodo.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
    const isSameDay = (d: Date) => d >= todayStart && d < todayEnd;

    const completedToday = todos.filter((t) => t.completedAt && isSameDay(t.completedAt));
    const overdueToday = todos.filter((t) => !t.done && t.dueDate && isSameDay(t.dueDate));
    const restOfWeek = todos.filter((t) => !t.done && t.dueDate && t.dueDate >= todayEnd && t.dueDate < weekEnd);

    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { lastTodoListIds: [...overdueToday, ...restOfWeek].map((t) => t.id) },
    });

    const labelOf = (t: (typeof todos)[number]) => `${t.title}（${projectNameOf.get(t.projectId)}）`;

    const lines: string[] = ['✅ 代辦事項總覽（所有專案）', ''];

    lines.push(`今日已完成（${completedToday.length}）：`);
    lines.push(...(completedToday.length ? completedToday.map((t) => `・${labelOf(t)}`) : ['（沒有）']));

    lines.push('', `今日到期但還沒完成（${overdueToday.length}）：`);
    lines.push(
      ...(overdueToday.length ? overdueToday.map((t, i) => `${i + 1}. ${labelOf(t)}`) : ['（沒有）']),
    );

    lines.push('', `未來 7 天內到期（${restOfWeek.length}）：`);
    lines.push(
      ...(restOfWeek.length
        ? restOfWeek.map(
            (t, i) => `${overdueToday.length + i + 1}. ${labelOf(t)}（${t.dueDate!.getMonth() + 1}/${t.dueDate!.getDate()}）`,
          )
        : ['（沒有）']),
    );

    lines.push('', '傳「完成 編號」標記完成，例如「完成 2」。');
    await this.reply(replyToken, lines.join('\n'));
  }

  private async createTodoFromText(activeProjectId: string | null, text: string, replyToken: string) {
    if (!activeProjectId) {
      await this.reply(replyToken, '請先傳「代辦事項」選擇要記錄的專案。');
      return;
    }
    const title = text.replace(/^新增(代辦|待辦)?/, '').replace(LEADING_SEPARATORS, '').trim();
    if (!title) {
      await this.reply(replyToken, '請在「新增」後面接代辦事項的內容，例如「新增 買材料」。');
      return;
    }
    const project = await this.prisma.project.findUnique({ where: { id: activeProjectId } });
    if (!project) {
      await this.reply(replyToken, '這個專案好像不存在了，傳「切換專案」重新選一個。');
      return;
    }
    const maxSortOrder = await this.prisma.projectTodo.aggregate({
      where: { projectId: activeProjectId },
      _max: { sortOrder: true },
    });
    await this.prisma.projectTodo.create({
      data: {
        projectId: activeProjectId,
        title,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
    await this.reply(replyToken, `已新增代辦事項「${title}」（${project.name}）。`);
  }

  /** "完成 N" references the Nth item of whichever list (代辦事項 or
   * 代辦事項總覽) was shown to this LINE user most recently — see
   * `LineAccountLink.lastTodoListIds`. Numbers don't shift after a
   * completion within the same shown list; completing the same number
   * twice just reports it's already done. */
  private async completeTodoByNumber(linkId: string, text: string, replyToken: string) {
    const match = text.match(/\d+/);
    if (!match) {
      await this.reply(replyToken, '請在「完成」後面接編號，例如「完成 2」，編號請先看「代辦事項」或「代辦事項總覽」。');
      return;
    }
    const n = Number(match[0]);
    const link = await this.prisma.lineAccountLink.findUnique({ where: { id: linkId } });
    const todoId = link?.lastTodoListIds[n - 1];
    if (!todoId) {
      await this.reply(replyToken, `找不到編號 ${n}，請先傳「代辦事項」或「代辦事項總覽」看目前的編號。`);
      return;
    }
    const todo = await this.prisma.projectTodo.findUnique({ where: { id: todoId }, include: { project: true } });
    if (!todo) {
      await this.reply(replyToken, '這筆代辦事項好像已經被刪除了。');
      return;
    }
    if (todo.done) {
      await this.reply(replyToken, `「${todo.title}」已經是完成狀態了。`);
      return;
    }
    await this.prisma.projectTodo.update({ where: { id: todo.id }, data: { done: true, completedAt: new Date() } });
    await this.reply(replyToken, `已完成「${todo.title}」（${todo.project.name}）。`);
  }

  // --- 行事曆 ---

  /** "新增行事曆 日期 時間 項目 [@地點]" — date is M/D or YYYY/M/D, time is
   * H:MM or 全天 for an all-day event, an optional "@地點" token sets
   * location. Fields may be separated by whitespace/punctuation or nothing
   * at all — date and time are self-delimiting (digits+"/", digits+":"),
   * so they can still be pulled out of glued-together text; @地點 is
   * self-delimiting too. Always the caller's own 1:1 calendar space —
   * unlike 專案代辦事項 there's no multi-space ambiguity to resolve here. */
  private async createCalendarEventFromText(userId: string, text: string, replyToken: string) {
    const parsed = this.parseCalendarCommand(text);
    if (!parsed) {
      await this.reply(
        replyToken,
        '看不懂格式，請用「新增行事曆 日期 時間 項目 [@地點]」，例如「新增行事曆 7/31 14:00 開會 @台北辦公室」；全天活動時間可以打「全天」。',
      );
      return;
    }

    const space = await this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } });
    if (!space) {
      await this.reply(replyToken, '你還沒有行事曆空間，請先到元序 App 建立一個。');
      return;
    }

    await this.calendarEventsService.create(userId, space.id, {
      title: parsed.title,
      startAt: parsed.startAt.toISOString(),
      allDay: parsed.allDay,
      location: parsed.location ?? undefined,
    });

    const dateLabel = `${parsed.startAt.getMonth() + 1}/${parsed.startAt.getDate()}`;
    const timeLabel = parsed.allDay
      ? '全天'
      : `${String(parsed.startAt.getHours()).padStart(2, '0')}:${String(parsed.startAt.getMinutes()).padStart(2, '0')}`;
    await this.reply(replyToken, `已新增行事曆「${parsed.title}」（${dateLabel} ${timeLabel}）。`);
  }

  private parseCalendarCommand(
    text: string,
  ): { startAt: Date; allDay: boolean; title: string; location: string | null } | null {
    let rest = text.replace(/^新增行事曆/, '').replace(LEADING_SEPARATORS, '');

    const dateMatch = rest.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,2}))?/);
    if (!dateMatch) return null;
    const year = dateMatch[3] ? Number(dateMatch[1]) : new Date().getFullYear();
    const month = Number(dateMatch[3] ? dateMatch[2] : dateMatch[1]);
    const day = Number(dateMatch[3] ?? dateMatch[2]);
    rest = rest.slice(dateMatch[0].length).replace(LEADING_SEPARATORS, '');

    let allDay = false;
    let hour = 9;
    let minute = 0;
    if (rest.startsWith('全天')) {
      allDay = true;
      rest = rest.slice(2);
    } else {
      const timeMatch = rest.match(/^(\d{1,2}):(\d{2})/);
      if (!timeMatch) return null;
      hour = Number(timeMatch[1]);
      minute = Number(timeMatch[2]);
      rest = rest.slice(timeMatch[0].length);
    }
    rest = rest.replace(LEADING_SEPARATORS, '');

    const startAt = allDay ? new Date(year, month - 1, day) : new Date(year, month - 1, day, hour, minute);
    if (Number.isNaN(startAt.getTime())) return null;

    let location: string | null = null;
    const locationMatch = rest.match(/@(\S+)$/);
    if (locationMatch) {
      location = locationMatch[1];
      rest = rest.slice(0, locationMatch.index);
    }

    const title = rest.replace(EDGE_SEPARATORS, '').trim();
    if (!title) return null;

    return { startAt, allDay, title, location };
  }

  private async reply(replyToken: string, text: string): Promise<void> {
    await this.callReplyApi({ replyToken, messages: [{ type: 'text', text }] });
  }

  private async replyWithQuickReply(replyToken: string, text: string, items: QuickReplyItem[]): Promise<void> {
    await this.callReplyApi({
      replyToken,
      messages: [
        {
          type: 'text',
          text,
          quickReply: {
            items: items.slice(0, MAX_QUICK_REPLY_ITEMS).map((item) => ({
              type: 'action',
              action: { type: 'postback', label: item.label, data: item.data, displayText: item.label },
            })),
          },
        },
      ],
    });
  }

  private async callReplyApi(body: Record<string, unknown>): Promise<void> {
    if (!this.channelAccessToken) {
      this.logger.warn('LINE_CHANNEL_ACCESS_TOKEN not set, skipping reply');
      return;
    }
    try {
      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error('Failed to send LINE reply', error);
    }
  }
}
