import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { LineRichMenuService, type MenuAction } from './line-rich-menu.service';
import {
  FinanceAccountType,
  FinanceCategoryKind,
  FinanceTransactionType,
  Prisma,
} from '../../generated/prisma/client.js';

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
  postback?: { data?: string };
}

interface PendingDraft {
  type?: 'EXPENSE' | 'INCOME';
  categoryId?: string;
  accountId?: string;
}

interface QuickReplyItem {
  label: string;
  data: string;
}

const LINK_CODE_TTL_MINUTES = 10;
/** LINE caps a message's quickReply.items at 13. */
const MAX_QUICK_REPLY_ITEMS = 13;
/** LINE caps a rich menu at 20 tappable areas; one is always reserved for
 * the 取消 button appended by `LineRichMenuService.createSelectionMenu`. */
const MAX_RICH_MENU_SELECTION_ITEMS = 19;

/**
 * Backs the 記帳 LINE bot: verifying LINE's webhook signature, linking a
 * LINE account to a life_os user (via a short-lived code generated in the
 * app), and recording `FinanceTransaction` rows against that user's
 * personal space — either via a guided flow driven entirely by the bottom
 * rich menu (支出/收入 → 分類 → 帳戶, each tap swaps in the next stage's
 * menu via `LineRichMenuService`, then the user only ever has to type the
 * amount) or a direct one-line command for anyone
 * who prefers typing ("支出 120 午餐 現金"), plus a "總覽" command reading
 * back balances/spending. Writes go straight through Prisma rather than the
 * HTTP-facing `Finance*Service` layer (built around "an authenticated user
 * acting on their own space via the app's own endpoints") since this is a
 * different trust boundary — the caller here is LINE itself, authenticated
 * by HMAC signature rather than a JWT, already resolved down to a specific
 * `userId` by the time any finance write happens. Reads (the 總覽 command)
 * do reuse `FinanceAccountsService`/`FinanceTransactionsService` directly
 * — no access-boundary reason not to, and it keeps the balance/summary math
 * in exactly one place instead of a second copy drifting out of sync.
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
    private readonly richMenu: LineRichMenuService,
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
          await this.handlePostback(link.id, link.userId, lineUserId, event.postback.data, replyToken);
          continue;
        }

        if (event.type !== 'message' || event.message?.type !== 'text') continue;
        const text = event.message.text?.trim();
        if (!text) continue;

        if (link) {
          await this.handleTextForLinkedUser(
            link.id,
            link.userId,
            lineUserId,
            link.pendingDraft as PendingDraft | null,
            link.activeProjectId,
            text,
            replyToken,
          );
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
      '綁定成功！傳任何一句話就會開始記帳流程（選支出/收入 → 分類 → 帳戶，最後輸入金額），也可以直接傳「支出 120 午餐 現金」一次記完。',
    );
  }

  // --- Guided quick-reply flow ---

  private async handlePostback(
    linkId: string,
    userId: string,
    lineUserId: string,
    data: string,
    replyToken: string,
  ) {
    if (data === 'cancel') {
      await this.prisma.lineAccountLink.update({
        where: { id: linkId },
        data: { pendingDraft: Prisma.DbNull },
      });
      await this.revertToDefaultMenu(linkId, lineUserId);
      await this.reply(replyToken, '已取消。');
      return;
    }

    const [key, value] = data.split(':');
    if (key === 't' && (value === 'EXPENSE' || value === 'INCOME')) {
      const draft: PendingDraft = { type: value };
      await this.saveDraft(linkId, draft);
      await this.promptCategory(userId, linkId, lineUserId, draft, replyToken);
      return;
    }
    if (key === 'c') {
      const draft: PendingDraft = { type: await this.currentType(linkId), categoryId: value };
      await this.saveDraft(linkId, draft);
      await this.promptAccount(userId, linkId, lineUserId, draft, replyToken);
      return;
    }
    if (key === 'a') {
      const existing = await this.prisma.lineAccountLink.findUnique({ where: { id: linkId } });
      const draft: PendingDraft = { ...(existing?.pendingDraft as PendingDraft | null), accountId: value };
      await this.saveDraft(linkId, draft);
      await this.revertToDefaultMenu(linkId, lineUserId);
      await this.reply(replyToken, '請輸入金額，可以加備註，例如「120 午餐」。');
      return;
    }
    if (key === 'proj') {
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { activeProjectId: value } });
      await this.sendTodoOverview(value, replyToken);
    }
  }

  // --- Rich-menu stage switching: each guided-flow step swaps the user's
  // bottom menu instead of showing chat quick-reply bubbles, so the whole
  // flow (支出/收入 → 分類 → 帳戶) happens by tapping the persistent menu and
  // the user only ever types the final amount. ---

  private async transitionToEphemeralMenu(
    linkId: string,
    lineUserId: string,
    items: MenuAction[],
    menuName: string,
  ): Promise<void> {
    await this.deletePendingEphemeralMenu(linkId);
    const richMenuId = await this.richMenu.createSelectionMenu(items, menuName);
    await this.richMenu.linkToUser(lineUserId, richMenuId);
    await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { pendingRichMenuId: richMenuId } });
  }

  private async revertToDefaultMenu(linkId: string, lineUserId: string): Promise<void> {
    await this.deletePendingEphemeralMenu(linkId);
    await this.richMenu.unlinkUser(lineUserId);
  }

  /** Called whenever an incoming message is about to be handled as
   * something other than continuing the 記帳 guided flow (代辦事項 command,
   * 總覽, one-line 記帳 command, ...) — if a flow was mid-way (pendingDraft
   * truthy), its bottom-menu override may still be showing a 分類/帳戶 stage
   * menu, so this cleans that up before moving on. No-op (cheap) if the
   * flow was already at rest. */
  private async abandonFinanceFlowIfActive(
    linkId: string,
    lineUserId: string,
    pendingDraft: PendingDraft | null,
  ): Promise<void> {
    if (!pendingDraft) return;
    await this.saveDraft(linkId, {});
    await this.revertToDefaultMenu(linkId, lineUserId);
  }

  /** Deletes and clears the previous per-user ephemeral menu (分類/帳戶
   * selection), if any — always call before linking the next stage so
   * stale menus don't accumulate. Returns whether one existed. */
  private async deletePendingEphemeralMenu(linkId: string): Promise<boolean> {
    const existing = await this.prisma.lineAccountLink.findUnique({ where: { id: linkId } });
    if (!existing?.pendingRichMenuId) return false;
    await this.richMenu.deleteMenu(existing.pendingRichMenuId);
    await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { pendingRichMenuId: null } });
    return true;
  }

  private async currentType(linkId: string): Promise<'EXPENSE' | 'INCOME' | undefined> {
    const existing = await this.prisma.lineAccountLink.findUnique({ where: { id: linkId } });
    return (existing?.pendingDraft as PendingDraft | null)?.type;
  }

  private async saveDraft(linkId: string, draft: PendingDraft) {
    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { pendingDraft: draft as object },
    });
  }

  private async startFlow(linkId: string, lineUserId: string, replyToken: string) {
    await this.saveDraft(linkId, {});
    await this.deletePendingEphemeralMenu(linkId);
    const typeMenuId = await this.richMenu.getOrCreateTypeMenu();
    await this.richMenu.linkToUser(lineUserId, typeMenuId);
    await this.reply(replyToken, '請用下方選單選擇支出還是收入。');
  }

  private async promptCategory(
    userId: string,
    linkId: string,
    lineUserId: string,
    draft: PendingDraft,
    replyToken: string,
  ) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    const kind = draft.type === 'INCOME' ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE;
    const categories = await this.prisma.financeCategory.findMany({
      where: { spaceId: space.id, kind },
      orderBy: { sortOrder: 'asc' },
      take: MAX_RICH_MENU_SELECTION_ITEMS,
    });
    if (categories.length === 0) {
      await this.reply(replyToken, '還沒有任何分類，請先到元序 App 記帳「分類」分頁新增。');
      return;
    }
    await this.transitionToEphemeralMenu(
      linkId,
      lineUserId,
      categories.map((c) => ({ label: c.name, data: `c:${c.id}` })),
      `元序-分類選單-${linkId}`,
    );
    await this.reply(replyToken, '請用下方選單選分類。');
  }

  private async promptAccount(
    userId: string,
    linkId: string,
    lineUserId: string,
    draft: PendingDraft,
    replyToken: string,
  ) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
      take: MAX_RICH_MENU_SELECTION_ITEMS,
    });
    if (accounts.length === 0) {
      await this.reply(replyToken, '還沒有任何帳戶，請先到元序 App 記帳「帳戶」分頁新增。');
      return;
    }
    await this.transitionToEphemeralMenu(
      linkId,
      lineUserId,
      accounts.map((a) => ({ label: a.name, data: `a:${a.id}` })),
      `元序-帳戶選單-${linkId}`,
    );
    await this.reply(replyToken, '請用下方選單選帳戶。');
  }

  // --- Free-text handling for a linked user (either finishing a draft's
  // amount, a one-line "支出 120 午餐 現金" command, or starting the guided
  // flow for anything else) ---

  private static readonly OVERVIEW_KEYWORDS = ['總覽', '財務總覽', '總覽財務'];
  private static readonly TODO_ENTRY_KEYWORDS = ['代辦', '代辦事項', '待辦', '待辦事項'];

  private async handleTextForLinkedUser(
    linkId: string,
    userId: string,
    lineUserId: string,
    pendingDraft: PendingDraft | null,
    activeProjectId: string | null,
    text: string,
    replyToken: string,
  ) {
    if (LineService.OVERVIEW_KEYWORDS.includes(text)) {
      await this.abandonFinanceFlowIfActive(linkId, lineUserId, pendingDraft);
      await this.sendOverview(userId, replyToken);
      return;
    }

    if (LineService.TODO_ENTRY_KEYWORDS.includes(text)) {
      await this.abandonFinanceFlowIfActive(linkId, lineUserId, pendingDraft);
      await this.enterTodoFlow(linkId, userId, activeProjectId, replyToken);
      return;
    }
    if (text === '切換專案') {
      await this.abandonFinanceFlowIfActive(linkId, lineUserId, pendingDraft);
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { activeProjectId: null } });
      await this.enterTodoFlow(linkId, userId, null, replyToken);
      return;
    }
    if (text.startsWith('新增行事曆')) {
      await this.abandonFinanceFlowIfActive(linkId, lineUserId, pendingDraft);
      await this.createCalendarEventFromText(userId, text, replyToken);
      return;
    }
    if (text.startsWith('新增')) {
      await this.abandonFinanceFlowIfActive(linkId, lineUserId, pendingDraft);
      await this.createTodoFromText(activeProjectId, text, replyToken);
      return;
    }
    if (text.startsWith('完成')) {
      await this.abandonFinanceFlowIfActive(linkId, lineUserId, pendingDraft);
      await this.completeTodoFromText(activeProjectId, text, replyToken);
      return;
    }

    if (pendingDraft?.type && pendingDraft.categoryId && pendingDraft.accountId) {
      await this.finishDraftWithAmount(linkId, userId, pendingDraft, text, replyToken);
      return;
    }

    const command = this.parseCommand(text);
    if (command) {
      await this.abandonFinanceFlowIfActive(linkId, lineUserId, pendingDraft);
      await this.createTransactionFromCommand(userId, command, replyToken);
      return;
    }

    await this.startFlow(linkId, lineUserId, replyToken);
  }

  // --- 專案代辦事項 ---

  /** No active project yet → list the user's projects as quick-reply
   * buttons to pick one (auto-picks if there's only one); otherwise shows
   * that project's todo overview directly. */
  private async enterTodoFlow(
    linkId: string,
    userId: string,
    activeProjectId: string | null,
    replyToken: string,
  ) {
    if (activeProjectId) {
      await this.sendTodoOverview(activeProjectId, replyToken);
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
      await this.sendTodoOverview(projectId, replyToken);
      return;
    }
    await this.replyWithQuickReply(
      replyToken,
      '要記哪個專案的代辦事項？',
      memberships.map((m) => ({ label: m.project.name.slice(0, 20), data: `proj:${m.project.id}` })),
    );
  }

  /** 今日完成的、今日到期但還沒完成的（該重新安排的）、未來 7 天內到期的其餘
   * 代辦事項 — everything the user asked for in one reply. */
  private async sendTodoOverview(projectId: string, replyToken: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      await this.reply(replyToken, '這個專案好像不存在了，傳「切換專案」重新選一個。');
      return;
    }
    const todos = await this.prisma.projectTodo.findMany({
      where: { projectId },
      orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
    const isSameDay = (d: Date) => d >= todayStart && d < todayEnd;

    const completedToday = todos.filter((t) => t.completedAt && isSameDay(t.completedAt));
    const overdueToday = todos.filter((t) => !t.done && t.dueDate && isSameDay(t.dueDate));
    const restOfWeek = todos.filter(
      (t) => !t.done && t.dueDate && t.dueDate >= todayEnd && t.dueDate < weekEnd,
    );

    const lines: string[] = [`✅ ${project.name}　代辦事項總覽`, ''];

    lines.push(`今日已完成（${completedToday.length}）：`);
    lines.push(...(completedToday.length ? completedToday.map((t) => `・${t.title}`) : ['（沒有）']));

    lines.push('', `今日到期但還沒完成，需要安排（${overdueToday.length}）：`);
    lines.push(...(overdueToday.length ? overdueToday.map((t) => `・${t.title}`) : ['（沒有）']));

    lines.push('', `未來 7 天內到期（${restOfWeek.length}）：`);
    lines.push(
      ...(restOfWeek.length
        ? restOfWeek.map((t) => `・${t.title}（${t.dueDate!.getMonth() + 1}/${t.dueDate!.getDate()}）`)
        : ['（沒有）']),
    );

    lines.push('', '傳「新增 XXX」新增代辦、「完成 XXX」標記完成、「切換專案」換專案。');

    await this.reply(replyToken, lines.join('\n'));
  }

  private async createTodoFromText(activeProjectId: string | null, text: string, replyToken: string) {
    if (!activeProjectId) {
      await this.reply(replyToken, '請先傳「代辦事項」選擇要記錄的專案。');
      return;
    }
    const title = text.replace(/^新增(代辦|待辦)?\s*/, '').trim();
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

  private async completeTodoFromText(activeProjectId: string | null, text: string, replyToken: string) {
    if (!activeProjectId) {
      await this.reply(replyToken, '請先傳「代辦事項」選擇要記錄的專案。');
      return;
    }
    const query = text.replace(/^完成(代辦|待辦)?\s*/, '').trim();
    if (!query) {
      await this.reply(replyToken, '請在「完成」後面接代辦事項的內容，例如「完成 買材料」。');
      return;
    }
    const incomplete = await this.prisma.projectTodo.findMany({
      where: { projectId: activeProjectId, done: false },
    });
    const exact = incomplete.filter((t) => t.title === query);
    const partial = exact.length > 0 ? exact : incomplete.filter((t) => t.title.includes(query));

    if (partial.length === 0) {
      await this.reply(replyToken, `找不到還沒完成、標題符合「${query}」的代辦事項。`);
      return;
    }
    if (partial.length > 1) {
      await this.reply(
        replyToken,
        `符合「${query}」的代辦事項不只一個，請打更完整的標題：\n${partial.map((t) => `・${t.title}`).join('\n')}`,
      );
      return;
    }
    await this.prisma.projectTodo.update({
      where: { id: partial[0].id },
      data: { done: true, completedAt: new Date() },
    });
    await this.reply(replyToken, `已完成「${partial[0].title}」。`);
  }

  // --- 行事曆 ---

  /** "新增行事曆 日期 時間 項目 [@地點]" — date is M/D or YYYY/M/D, time is
   * H:MM or 全天 for an all-day event, an optional trailing "@地點" token
   * sets location. Always the caller's own 1:1 calendar space — unlike
   * 專案代辦事項 there's no multi-space ambiguity to resolve here. */
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
    const rest = text.replace(/^新增行事曆\s*/, '').trim();
    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;

    const dateParts = tokens[0].split('/').map(Number);
    if (dateParts.length < 2 || dateParts.length > 3 || dateParts.some((n) => Number.isNaN(n))) return null;
    const [year, month, day] =
      dateParts.length === 3 ? dateParts : [new Date().getFullYear(), dateParts[0], dateParts[1]];

    const timeToken = tokens[1];
    const allDay = timeToken === '全天';
    let startAt: Date;
    if (allDay) {
      startAt = new Date(year, month - 1, day);
    } else {
      const timeParts = timeToken.split(':').map(Number);
      if (timeParts.length !== 2 || timeParts.some((n) => Number.isNaN(n))) return null;
      startAt = new Date(year, month - 1, day, timeParts[0], timeParts[1]);
    }
    if (Number.isNaN(startAt.getTime())) return null;

    let titleTokens = tokens.slice(2);
    let location: string | null = null;
    const lastToken = titleTokens[titleTokens.length - 1];
    if (lastToken?.startsWith('@') && lastToken.length > 1) {
      location = lastToken.slice(1);
      titleTokens = titleTokens.slice(0, -1);
    }
    const title = titleTokens.join(' ');
    if (!title) return null;

    return { startAt, allDay, title, location };
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

  private async finishDraftWithAmount(
    linkId: string,
    userId: string,
    draft: PendingDraft,
    text: string,
    replyToken: string,
  ) {
    const tokens = text.split(/\s+/).filter(Boolean);
    const amount = Number(tokens[0]);
    if (!Number.isFinite(amount) || amount <= 0) {
      await this.reply(replyToken, '看不懂金額，請輸入數字，例如「120」或「120 午餐」。');
      return;
    }
    const note = tokens.slice(1).join(' ') || null;

    const [account, category] = await Promise.all([
      this.prisma.financeAccount.findUnique({ where: { id: draft.accountId } }),
      this.prisma.financeCategory.findUnique({ where: { id: draft.categoryId } }),
    ]);
    if (!account || !category) {
      await this.saveDraft(linkId, {});
      await this.reply(replyToken, '這筆記帳的分類或帳戶好像被刪掉了，請重新開始一次。');
      return;
    }

    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) return;

    await this.prisma.financeTransaction.create({
      data: {
        spaceId: space.id,
        type: draft.type === 'INCOME' ? FinanceTransactionType.INCOME : FinanceTransactionType.EXPENSE,
        amount,
        accountId: account.id,
        categoryId: category.id,
        date: new Date(),
        note,
      },
    });
    await this.saveDraft(linkId, {});

    const typeLabel = draft.type === 'INCOME' ? '收入' : '支出';
    await this.reply(
      replyToken,
      `已記錄${typeLabel} ${amount.toLocaleString('en-US')}（${category.name} · ${account.name}）${note ? ' · ' + note : ''}`,
    );
  }

  private async createTransactionFromCommand(
    userId: string,
    parsed: { type: FinanceTransactionType; amount: number; rest: string[] },
    replyToken: string,
  ) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    if (accounts.length === 0) {
      await this.reply(replyToken, '你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return;
    }

    let account = accounts[0];
    let rest = parsed.rest;
    if (rest.length > 0) {
      const lastToken = rest[rest.length - 1];
      const matched = accounts.find((a) => a.name === lastToken);
      if (matched) {
        account = matched;
        rest = rest.slice(0, -1);
      }
    }
    const note = rest.join(' ') || null;

    await this.prisma.financeTransaction.create({
      data: {
        spaceId: space.id,
        type: parsed.type,
        amount: parsed.amount,
        accountId: account.id,
        date: new Date(),
        note,
      },
    });

    const typeLabel = parsed.type === FinanceTransactionType.EXPENSE ? '支出' : '收入';
    await this.reply(
      replyToken,
      `已記錄${typeLabel} ${parsed.amount.toLocaleString('en-US')}（${account.name}，未分類）${note ? ' · ' + note : ''}` +
        '\n想要有分類的話，下次可以直接傳任何一句話開始選單記帳。',
    );
  }

  /** One-line fast path for anyone who prefers typing over the guided
   * button flow — no category token, so it always lands as 未分類 (see the
   * guided flow above for a categorized alternative). */
  private parseCommand(
    text: string,
  ): { type: FinanceTransactionType; amount: number; rest: string[] } | null {
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;
    const type =
      tokens[0] === '支出'
        ? FinanceTransactionType.EXPENSE
        : tokens[0] === '收入'
          ? FinanceTransactionType.INCOME
          : null;
    if (!type) return null;
    const amount = Number(tokens[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { type, amount, rest: tokens.slice(2) };
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
