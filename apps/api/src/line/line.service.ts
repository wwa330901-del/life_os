import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { VoiceTranscriberService } from './voice-transcriber.service';
import { SYSTEM_TROUBLE_MESSAGE } from '../error-report/system-trouble';
import { aiUnavailableMessage, AiUnavailableError } from '../ai/ai-errors';
import { AiUsageService, featureUsageLines } from '../knowledge/ai-usage.service';
import { AiUsageAdminService } from '../admin/ai-usage-admin.service';
import { SubscriptionService } from '../finance/subscription.service';
import { subscriptionsText } from '../finance/subscriptions';
import { WishlistService } from '../finance/wishlist.service';
import { RetirementService } from '../finance/retirement.service';
import { TripsService } from '../trips/trips.service';
import { packingText } from '../trips/trip';
import { UserLocationService } from '../users/user-location.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { LifeReviewService } from '../life-review/life-review.service';
import { DailyBriefService } from '../daily-brief/daily-brief.service';
import { ReminderOverviewService } from '../daily-brief/reminder-overview.service';
import { FinancePlanService } from '../finance/finance-plan.service';
import { FinanceHealthService, formatFinanceHealth } from '../finance/finance-health.service';
import type { LineAccountLink } from '../../generated/prisma/client.js';
import { LineMessageLogService, QuotedMessage, withQuoteContext } from '../line-notifier/line-message-log.service';
import { LineReplyService } from './line-reply.service';
import { LineLinkingService } from './line-linking.service';
import { LineTodoCommandsService } from './line-todo-commands.service';
import { LineCalendarCommandsService } from './line-calendar-commands.service';
import { LineFinanceCommandsService } from './line-finance-commands.service';
import { LineLoanCommandsService } from './line-loan-commands.service';
import { LineStockCommandsService } from './line-stock-commands.service';
import { LineKnowledgeService } from './line-knowledge.service';
import { LineAiService } from './line-ai.service';
import { AI_POSTBACK_TEXT, LineWebhookEvent, Responder, LINK_CODE_TTL_MINUTES, notUnderstoodMessage, GUIDE_TOPICS } from './line-shared';

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
 * - 代辦事項 / 代辦事項總覽: always the caller's own 個人代辦事項 (no
 *   company-space project concept anymore) — "完成 N" references the Nth
 *   item of whichever list was shown last (`LineAccountLink.lastTodoListIds`)
 *   instead of matching by typed title — titles typed while completing
 *   something often don't match what was typed when it was created.
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly messageLog: LineMessageLogService,
    private readonly usersService: UsersService,
    private readonly lifeReview: LifeReviewService,
    private readonly financeHealth: FinanceHealthService,
    private readonly dailyBrief: DailyBriefService,
    private readonly reminderOverview: ReminderOverviewService,
    private readonly financePlan: FinancePlanService,
    private readonly voice: VoiceTranscriberService,
    private readonly aiUsage: AiUsageService,
    private readonly aiUsageAdmin: AiUsageAdminService,
    private readonly subscriptionService: SubscriptionService,
    private readonly wishlist: WishlistService,
    private readonly retirement: RetirementService,
    private readonly trips: TripsService,
    private readonly userLocation: UserLocationService,
    private readonly out: LineReplyService,
    private readonly linking: LineLinkingService,
    private readonly todos: LineTodoCommandsService,
    private readonly calendar: LineCalendarCommandsService,
    private readonly finance: LineFinanceCommandsService,
    private readonly loans: LineLoanCommandsService,
    private readonly stocks: LineStockCommandsService,
    private readonly knowledge: LineKnowledgeService,
    private readonly ai: LineAiService,
  ) {}

  private readonly logger = new Logger(LineService.name);
  private readonly channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !this.channelSecret) return false;
    const expected = crypto
      .createHmac('sha256', this.channelSecret)
      .update(rawBody)
      .digest('base64');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  async generateLinkCode(
    userId: string,
  ): Promise<{ code: string; expiresAt: Date }> {
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
      this.out.eventState.enterWith({ aiFailed: false });

      try {
        const link = await this.prisma.lineAccountLink.findUnique({
          where: { lineUserId },
        });
        const state = this.out.eventState.getStore();
        if (state && link) state.userId = link.userId;
        if (link && event.type === 'message' && event.message) await this.messageLog.recordReceived(link.userId, event.message);

        // LINE 代辦提醒上的「完成了」「延後」按鈕。
        if (event.type === 'postback') {
          const data = event.postback?.data ?? '';
          if (link && data.startsWith('todo:')) await this.todos.handleTodoPostback(link, data, replyToken, event.postback?.params?.datetime);
          // AI 問確認時的「確定」「取消」按鈕：當成使用者打了那句話
          const answer = AI_POSTBACK_TEXT[data];
          if (link && answer) await this.handleTextForLinkedUser(link, answer, replyToken, undefined);
          if (data.startsWith('guide:')) await this.out.callReplyApi({ replyToken, messages: [LineService.guideMessage(true, data.slice(6))] });
          // 回顧最後的「下次檢查這件」「我自己想一件」
          if (link && data.startsWith('review:focus:')) {
            const focus = await this.lifeReview.setFocus(link.userId, data.slice('review:focus:'.length));
            await this.out.reply(replyToken, `好，下次回顧會先幫你看「${focus}」做得怎麼樣 👍`);
          }
          if (link && data === 'review:custom') {
            await this.out.reply(replyToken, '直接打「下次檢查：」再接你想注意的事，例如「下次檢查：每天走一萬步」。');
          }
          continue;
        }

        if (event.type === 'message' && event.message?.type === 'image') {
          if (!link) continue;
          await this.ai.handleImageMessage(link, event.message.id, replyToken);
          continue;
        }

        // 「＋」→「位置資訊」：記成使用者目前的位置（問天氣、找附近的用）。
        if (event.type === 'message' && event.message?.type === 'location') {
          if (!link) continue;
          const { latitude, longitude, address, title } = event.message;
          if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
          const name = (title || address || '你傳的位置').replace(/^\d{3,6}/, '').replace(/^(台灣|臺灣)/, '').slice(0, 60);
          await this.userLocation.updateFromLine(link.userId, latitude, longitude, name);
          await this.out.reply(replyToken, `📍 記住你現在在「${name}」了。問天氣、找附近吃的沒講地點，就用這裡。`);
          continue;
        }

        if (event.type === 'message' && event.message?.type === 'audio') {
          if (!link) continue;
          await this.handleAudioMessage(link, event.message.id, replyToken);
          continue;
        }

        if (event.type === 'message' && event.message?.type === 'video') {
          if (!link) continue;
          await this.knowledge.handleVideoMessage(
            link.id,
            link.userId,
            event.message.id,
            replyToken,
          );
          continue;
        }

        if (event.type !== 'message' || event.message?.type !== 'text')
          continue;
        const text = event.message.text?.trim();
        if (!text) continue;

        if (link) {
          // 長按訊息按「回覆」：undefined＝沒有引用，null＝有引用但原文沒記到。
          const quotedId = event.message.quotedMessageId;
          const quoted = quotedId ? await this.messageLog.findQuoted(link.userId, quotedId) : undefined;
          await this.handleTextForLinkedUser(link, text, replyToken, quoted);
        } else {
          await this.linking.tryCompleteLinking(lineUserId, text, replyToken);
        }
      } catch (error) {
        this.logger.error('Failed to handle LINE event', error);
        // 細節已通知管理員；使用者只看到「已通知管理員」（reply 自己會吞錯，
        // replyToken 已經用過就只是送不出去）。
        await this.out.reply(replyToken, SYSTEM_TROUBLE_MESSAGE);
      }
    }
  }

  /** Messages that clearly want the AI (goals, check-ins, "幫我排…") even
   * while no AI conversation is active — routed to it before the
   * batch/command parsers so e.g. a multi-line book reflection isn't split
   * into per-line 記帳 commands. */
  private static readonly AI_FIRST_HINT = /目標|打卡|讀完|看完|讀了一本|最喜歡的一句|幫我|安排|排時間|提醒我|分鐘後|小時後|叫我|算命|想算|占卜|卜卦|運勢|理財|財務規劃|卡費|信用卡|結帳日|繳款日|記住|記得|忘掉|生日|紀念日|週年|約好|還款日|借|還我|天氣|下雨|帶傘|氣溫|想買|想要買|購物車|買得起|撥.*買東西|旅行|旅遊|出國|去玩|行李|退休|轉帳|轉到|轉進|轉入|轉出|匯款|匯到|匯給|提款|領錢|領現金|存進|貸款|學貸|房貸|車貸|信貸|分期|餘額|還剩多少|還有多少錢|剩多少錢|存款|補登|之前.{0,8}墊|期初代墊|墊.{0,6}還沒收|還沒收回|平帳|其實只剩|其實剩|其實有|實際剩|實際有|只剩下?\d/;

  private static readonly OVERVIEW_KEYWORDS = ['財務總覽', '總覽', '總覽財務', '餘額', '帳戶餘額'];
  // 圖文選單（2026-10-01 改成 6 格）的「我能做什麼」——選單只留主要功能，
  // 其他都靠直接跟 AI 講，這裡列出可以叫它做什麼。
  private static readonly GUIDE_KEYWORDS = ['我能做什麼', '可以做什麼', '功能', '說明', '使用說明'];
  private static readonly AI_USAGE_KEYWORDS = ['AI 用量', 'AI用量', 'ai 用量', 'ai用量'];
  private static readonly MENU_COMMANDS = new Set([
    '財務總覽',
    '今日行事曆',
    '代辦事項總覽',
    '人生目標',
    '知識庫',
    '週回顧',
    '月回顧',
    '財務健檢',
    '早報',
    '提醒總覽',
    '我的提醒',
    '理財評估',
    '財務規劃',
    '套用預算',
    '關閉早報',
    '開啟早報',
    '購物車',
    '退休試算',
    '退休',
    '旅行',
    '我的旅行',
    '關閉旅行提醒',
    '開啟旅行提醒',
    '訂閱',
    '我的訂閱',
    '關閉花費提醒',
    '開啟花費提醒',
    '關閉訂閱提醒',
    '開啟訂閱提醒',
    '關閉日記提醒',
    '開啟日記提醒',
    ...LineService.GUIDE_KEYWORDS,
    ...LineService.AI_USAGE_KEYWORDS,
  ]);

  /** 「我能做什麼」（2026-11-22 分主題）：先短短一段＋5 個主題按鈕，按了只看那一類。 */
  private static guideMessage(hasAi: boolean, topic?: string): Record<string, unknown> {
    const text = hasAi
      ? (topic && GUIDE_TOPICS[topic]?.text) ||
        ['💬 直接跟我講話就好，不用記指令；懶得打字就傳語音或拍照。', '', '想看哪一類的例子？點下面的按鈕 👇'].join('\n')
      : [
          '⚠️ 還沒設定 AI 金鑰，只能用固定指令（例如「支出 120 午餐 現金」「早報」「財務總覽」）。',
          '到元序 App 的「設定 → AI 設定」貼上 Claude 金鑰後，就能直接跟我講話。',
        ].join('\n');
    if (!hasAi) return { type: 'text', text };
    return {
      type: 'text',
      text,
      quickReply: {
        items: Object.entries(GUIDE_TOPICS).map(([key, t]) => ({
          type: 'action',
          action: { type: 'postback', label: t.label, data: `guide:${key}`, displayText: `說明：${t.label}` },
        })),
      },
    };
  }
  private static readonly TODO_ENTRY_KEYWORDS = [
    '代辦事項',
    '代辦',
    '待辦事項',
    '待辦',
  ];

  private async handleTextForLinkedUser(
    link: LineAccountLink,
    text: string,
    replyToken: string,
    quoted?: QuotedMessage | null,
  ) {
    const linkId = link.id;
    const userId = link.userId;

    if (quoted?.todoId && (await this.todos.tryHandleQuotedReminder(link, quoted.todoId, text, replyToken))) return;
    if (link.pendingSnoozeTodoId && (await this.todos.tryResolveSnooze(link, text, replyToken))) return;

    // --- 知識庫：任何等待中的狀態一律優先處理，因為此時使用者打的任何文字
    // （包含剛好也是選單指令字面的內容）都是在回答那個等待中的問題，不是在
    // 下一個新指令。
    if (link.pendingKnowledgeItemId) {
      await this.knowledge.tryResolveKnowledgeCategoryDecision(link, text, replyToken);
      return;
    }
    if (link.pendingKnowledgeLocationQueryCategory) {
      await this.knowledge.resolveKnowledgeLocationQuery(link, text, replyToken);
      return;
    }
    if (link.pendingExhibitionScheduleItemId) {
      await this.knowledge.resolveExhibitionSchedule(link, text, replyToken);
      return;
    }

    if (text === '美食' || text === '景點') {
      await this.prisma.lineAccountLink.update({
        where: { id: linkId },
        data: { pendingKnowledgeLocationQueryCategory: text },
      });
      await this.out.reply(replyToken, `請輸入地點，我幫你找附近記錄過的${text}。`);
      return;
    }
    if (text === '展覽') {
      await this.knowledge.sendUpcomingExhibitions(userId, replyToken);
      return;
    }
    if (text === '知識庫') {
      await this.out.reply(
        replyToken,
        [
          '📚 知識庫',
          '傳連結／圖片／影片給我，自動分析收藏',
          '純文字要加「分析」開頭：分析 <內容>',
          '',
          '美食／景點／展覽　查詢記錄過的地點',
        ].join('\n'),
      );
      return;
    }

    const url = this.knowledge.extractUrl(text);
    if (url) {
      await this.knowledge.captureKnowledgeUrl(userId, url, replyToken);
      return;
    }

    // 「分析 <貼上的文字>」——知識庫的第四種擷取入口（網址/圖片/影片都不需要
    // 前綴，但貼上的純文字沒有明確訊號分辨是要收藏還是打錯指令，所以這個入
    // 口需要明確的「分析」前綴，2026-08-05 使用者明確選擇這個設計）。放在網
    // 址擷取之後、批次多行判斷之前，理由跟網址擷取一樣——真實文章/筆記內容
    // 常常是多行的，要在被誤判成批次逐行指令之前先攔下來當一整塊處理。
    if (text.startsWith('分析')) {
      await this.knowledge.captureKnowledgeText(userId, text, replyToken);
      return;
    }

    // LINE 萬用 AI（2026-09-30）：沒設 Claude 金鑰的人完全走原本的固定指令。
    // 正在跟 AI 一問一答（它剛問「存到 Google 還是 iPhone？」「記在現金可以
    // 嗎？」），或訊息明顯是要 AI 幫忙時，優先交給 AI。
    const claudeApiKey = (await this.usersService.findById(userId))?.claudeApiKey ?? null;
    // 選單按鈕送出的文字永遠走固定回覆，就算正在跟 AI 聊天也一樣。
    const aiFirst =
      claudeApiKey != null &&
      !LineService.MENU_COMMANDS.has(text) &&
      (quoted !== undefined ||
        AiAgentService.isConversationActive(link) ||
        AiAgentService.isJournalPromptActive(link) ||
        AiAgentService.divinationFeedbackPending(link) != null ||
        LineService.AI_FIRST_HINT.test(text));
    // 關鍵字明顯要做事 → 直接 Agent；只是對話進行中 → 讓分流判斷。
    // （天氣字眼只讓 AI 先接，不強制 Agent——輕量 AI 自己會查天氣。）
    const forceAgent = LineService.AI_FIRST_HINT.test(text.replace(/天氣|下雨|帶傘|氣溫/g, ''));
    const aiText = quoted === undefined ? text : withQuoteContext(text, quoted);
    if (aiFirst && (await this.ai.tryAiAgent(link, aiText, replyToken, claudeApiKey, forceAgent))) return;

    // --- 條列式一次登陸多筆（2026-08-04）：貼多行文字，每行各自當一筆獨立
    // 的記帳／代辦／股票交易／行事曆指令處理，不用一則訊息只能記一筆。編
    // 號（「1.」「2、」...）是選用的，有就自動剝掉。只有這四種「登陸」指
    // 令適用，選單類指令（代辦事項、記帳說明...）在多行模式下就是看不懂。
    // 放在網址擷取之後，避免「連結+說明文字」分兩行貼過來時被誤判成批次
    // 而漏掉知識庫分析。
    const batchLines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (batchLines.length >= 2) {
      // 2026-10-12 使用者回報「交通 250 現金／晚餐 700 中信卡」分兩行就全部
      // 「看不懂」（一行一則 AI 都記得起來）。有固定格式以外的行、又有 AI →
      // 整則交給 AI 一筆一筆記；AI 接不住才回到逐行固定格式。
      const allFixedFormat = batchLines.every((line) =>
        LineService.BATCH_LINE_PREFIXES.some((p) => line.replace(LineService.LEADING_LINE_NUMBER, '').startsWith(p)),
      );
      const aiAlreadyFailed = this.out.eventState.getStore()?.aiFailed === true;
      if (claudeApiKey && !allFixedFormat && !aiAlreadyFailed && (await this.ai.tryAiAgent(link, text, replyToken, claudeApiKey, true))) return;
      const summaries: string[] = [];
      for (let i = 0; i < batchLines.length; i++) {
        const result = await this.tryBatchLine(link, batchLines[i]);
        summaries.push(`${i + 1}. ${result}`);
      }
      await this.out.reply(replyToken, summaries.join('\n'));
      return;
    }

    if (text === '記帳') {
      await this.finance.sendFinanceHelp(userId, replyToken);
      return;
    }
    if (LineService.OVERVIEW_KEYWORDS.includes(text)) {
      await this.finance.sendOverview(userId, replyToken);
      return;
    }
    if (text === '代辦事項總覽') {
      await this.todos.sendTodoOverviewAllProjects(linkId, userId, replyToken);
      return;
    }
    if (LineService.TODO_ENTRY_KEYWORDS.includes(text)) {
      await this.todos.sendTodoHelp(linkId, userId, replyToken);
      return;
    }
    // 新增行程／代辦現在一定要選存到 Google 還是 iPhone，固定指令沒辦法問，
    // 有 AI 的人交給 AI（它會問）；沒有的維持原本行為。
    if (
      claudeApiKey &&
      !aiFirst &&
      text.startsWith('新增') &&
      (await this.ai.tryAiAgent(link, text, replyToken, claudeApiKey, true))
    ) {
      return;
    }
    if (text.startsWith('新增行事曆')) {
      await this.calendar.createCalendarEventFromText(userId, text, (msg) => this.out.reply(replyToken, msg));
      return;
    }
    if (text === '今日行事曆') {
      await this.calendar.sendTodayCalendarEvents(userId, replyToken);
      return;
    }
    if (text.startsWith('新增')) {
      await this.todos.createTodoFromText(link, text, (msg) => this.out.reply(replyToken, msg));
      return;
    }
    if (text.startsWith('完成')) {
      await this.todos.completeTodoByNumber(linkId, text, replyToken);
      return;
    }
    if (text.startsWith('改期')) {
      await this.todos.rescheduleTodoByNumber(linkId, text, replyToken);
      return;
    }

    if (text === '股票買賣') {
      await this.stocks.sendStockHelp(userId, replyToken);
      return;
    }
    if (text === '持股總覽' || text === '持股') {
      await this.stocks.sendStockHoldings(userId, replyToken);
      return;
    }

    if (text === '借貸列表') {
      await this.loans.sendLoanList(linkId, userId, replyToken);
      return;
    }
    if (text.startsWith('還款')) {
      await this.loans.repayLoanByNumber(linkId, text, replyToken);
      return;
    }
    if (text === '代墊列表') {
      await this.loans.sendAdvanceList(linkId, userId, replyToken);
      return;
    }
    if (text.startsWith('收回代墊')) {
      await this.loans.repayAdvanceByNumber(linkId, text, replyToken);
      return;
    }

    if (text === '人生目標') {
      await this.todos.sendLifeGoals(userId, replyToken);
      return;
    }

    if (text === '關閉日記提醒' || text === '開啟日記提醒') {
      const enabled = text === '開啟日記提醒';
      await this.prisma.lineAccountLink.update({
        where: { id: linkId },
        data: { journalReminderEnabled: enabled, journalPromptAt: null },
      });
      await this.out.reply(
        replyToken,
        enabled ? '好，之後每晚 9:30 沒寫日記會問你一聲 📝' : '好，不會再每晚問你了。想寫的時候直接跟我說就好。',
      );
      return;
    }

    if (text === '理財評估' || text === '財務規劃') {
      // 先問收入、固定支出、想法再規劃（2026-10-07 使用者要求）——交給 AI 問。
      if (claudeApiKey && (await this.ai.tryAiAgent(link, '我想做財務規劃', replyToken, claudeApiKey, true))) return;
      try {
        const { plan, structured } = await this.financePlan.generate(userId);
        const tail = structured.budgets.length ? '想照建議設預算，回我「套用預算」就幫你設好。' : '';
        await this.out.reply(replyToken, ['💼 財務規劃', '', plan, ...(tail ? ['', tail] : [])].join('\n'));
      } catch (error) {
        await this.out.reply(replyToken, error instanceof Error ? error.message : '財務規劃產生失敗');
      }
      return;
    }
    if (text === '套用預算') {
      try {
        const applied = await this.financePlan.applyLatestBudgets(userId);
        await this.out.reply(replyToken, applied.length ? `✅ 預算設好了：\n${applied.map((a) => `・${a}`).join('\n')}\n超過 80% 和超支時會提醒你。` : '建議的分類找不到，沒有設定任何預算。');
      } catch (error) {
        await this.out.reply(replyToken, error instanceof Error ? error.message : '套用失敗');
      }
      return;
    }
    if (text === '提醒總覽' || text === '我的提醒') {
      await this.out.reply(replyToken, await this.reminderOverview.text(userId));
      return;
    }
    if (text === '早報') {
      await this.out.reply(replyToken, (await this.dailyBrief.build(userId)) ?? '今天沒有行程、到期的代辦，也沒有要注意的預算 👍');
      return;
    }
    if (text === '關閉早報' || text === '開啟早報') {
      const enabled = text === '開啟早報';
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { morningBriefEnabled: enabled } });
      await this.out.reply(replyToken, enabled ? '好，每天早上 8 點會傳今天的重點給你 ☀️' : '好，不會再傳早報了。想看的時候傳「早報」就好。');
      return;
    }
    if (text === '關閉花費提醒' || text === '開啟花費提醒') {
      const enabled = text === '開啟花費提醒';
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { spendingAlertEnabled: enabled } });
      await this.out.reply(replyToken, enabled ? '好，哪個分類花太兇或有特別大的單筆，晚上 9 點會提醒你。' : '好，不會再傳花費提醒了。');
      return;
    }
    if (text === '關閉旅行提醒' || text === '開啟旅行提醒') {
      const enabled = text === '開啟旅行提醒';
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { tripReminderEnabled: enabled } });
      await this.out.reply(replyToken, enabled ? '好，出發前 7 天、前 1 天和回來隔天會提醒你。' : '好，不會再傳旅行提醒了。');
      return;
    }
    if (text === '旅行' || text === '我的旅行') {
      await this.out.reply(replyToken, await this.tripsText(userId));
      return;
    }
    if (text === '關閉訂閱提醒' || text === '開啟訂閱提醒') {
      const enabled = text === '開啟訂閱提醒';
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { subscriptionReminderEnabled: enabled } });
      await this.out.reply(replyToken, enabled ? '好，訂閱快扣款前 3 天會提醒你。' : '好，不會再傳訂閱續約提醒了。');
      return;
    }

    if (text === '財務健檢') {
      const health = await this.financeHealth.forUser(userId);
      await this.out.reply(replyToken, health ? formatFinanceHealth(health) : '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    if (text === '週回顧' || text === '月回顧') {
      const review = await this.lifeReview.build(userId, text === '週回顧' ? 'week' : 'month');
      await this.out.reply(replyToken, review ?? '這段時間還沒有任何記錄可以回顧。');
      return;
    }

    if (text === '購物車') {
      await this.out.reply(replyToken, await this.wishlist.text(userId));
      return;
    }
    if (text === '退休試算' || text === '退休') {
      await this.out.reply(replyToken, await this.retirement.text(userId));
      return;
    }
    if (text === '訂閱' || text === '我的訂閱') {
      const subs = await this.subscriptionService.listForUser(userId);
      await this.out.reply(replyToken, subs ? subscriptionsText(subs) : '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    if (LineService.AI_USAGE_KEYWORDS.includes(text)) {
      await this.out.reply(replyToken, await this.aiUsageText(userId));
      return;
    }
    // 「下次檢查：少喝飲料」→ 下次回顧先檢查這件（2026-11-22）
    const focusMatch = text.match(/^下次(?:回顧)?(?:幫我)?檢查[:：\s]*(.+)$/);
    if (focusMatch) {
      const focus = await this.lifeReview.setFocus(userId, focusMatch[1]);
      await this.out.reply(replyToken, `好，下次回顧會先幫你看「${focus}」做得怎麼樣 👍`);
      return;
    }
    if (LineService.GUIDE_KEYWORDS.includes(text)) {
      await this.out.callReplyApi({ replyToken, messages: [LineService.guideMessage(claudeApiKey != null)] });
      return;
    }

    if (text.startsWith('查詢')) {
      await this.ai.handleAiQuery(link, text, replyToken);
      return;
    }

    const replyOnce: Responder = (msg) => this.out.reply(replyToken, msg);
    if (await this.finance.tryFinanceCommand(userId, text, replyOnce, claudeApiKey != null)) return;
    if (await this.finance.tryTransferCommand(userId, text, replyOnce)) return;
    if (await this.loans.tryLoanCommand(userId, text, replyOnce)) return;
    if (await this.loans.tryAdvanceCommand(userId, text, replyOnce)) return;
    if (await this.stocks.tryStockCommand(userId, text, replyOnce)) return;
    if (await this.stocks.tryStockDcaReply(userId, text, replyToken)) return;

    // 固定指令都對不上：交給 AI（「午餐 120」「體重現在 72」「下週三下午兩點
    // 跟客戶開會」），它也處理不了才回「看不懂」。前面已經問過 AI 的不再問。
    if (claudeApiKey && !aiFirst && (await this.ai.tryAiAgent(link, text, replyToken, claudeApiKey))) return;
    if (this.out.eventState.getStore()?.aiFailed) {
      await this.out.reply(replyToken, SYSTEM_TROUBLE_MESSAGE);
      return;
    }

    if (claudeApiKey) {
      // 2026-11-22：有 AI 也看不懂 → 不丟一大串指令，給幾個選項按鈕
      await this.out.callReplyApi({ replyToken, messages: [notUnderstoodMessage(text)] });
      return;
    }

    await this.out.reply(
      replyToken,
      [
        '看不懂這個指令，試試：',
        '',
        '💰 記帳｜轉帳｜財務總覽',
        '支出300午餐現金（傳「記帳」看完整格式）',
        '',
        '💳 借貸｜代墊',
        '借出3000給小明｜代墊5000材料款',
        '（傳「借貸列表」「代墊列表」看已登記的，登記還款/收回一樣傳列表）',
        '',
        '📈 股票',
        '買股0050 152 3000 國泰世華（傳「股票買賣」看完整格式）',
        '傳「持股總覽」看損益',
        '',
        '✅ 代辦事項　📅 行事曆',
        '新增行事曆7/31 14:00開會',
        '（傳「代辦事項」「今日行事曆」看清單）',
        '',
        '🎯 人生目標',
        '傳「人生目標」看進度，直接用講的記錄：',
        '「讀完原子習慣，最喜歡：每天進步1%」「體重現在72」',
        '',
        '📚 知識庫　🤖 AI 問答',
        '傳「知識庫」看完整說明｜查詢 <問題>',
        '',
        '貼多行文字可以一次記多筆，例如：',
        '支出300午餐現金\n買股0050 152 3000 國泰世華',
      ].join('\n'),
    );
  }

  private static readonly LEADING_LINE_NUMBER = /^\d+[.\)、\-]\s*/;
  /** 開頭是這些的行 `tryBatchLine` 才看得懂（順序同 tryBatchLine）。 */
  private static readonly BATCH_LINE_PREFIXES = ['新增', '買股', '賣股', '支出', '收入', '借出', '借入', '代墊'];

  /** One line of a 條列式批次訊息 (see the batch check in
   * `handleTextForLinkedUser`) — tries each 登陸-style command in turn
   * (行事曆/代辦/股票/記帳, same order the single-line router tries them)
   * with a capturing `Responder` instead of a real LINE reply, and returns
   * whatever that command would have said. A line matching no known
   * command shape gets a plain "看不懂" rather than the full menu (the
   * batch reply is already one line per item; repeating the whole command
   * list for every unrecognized line would bury the ones that worked). */
  private async tryBatchLine(link: LineAccountLink, rawLine: string): Promise<string> {
    const line = rawLine.replace(LineService.LEADING_LINE_NUMBER, '').trim();
    if (!line) return '（空白，略過）';

    const results: string[] = [];
    const capture: Responder = async (msg) => {
      results.push(msg);
    };

    if (line.startsWith('新增行事曆')) {
      await this.calendar.createCalendarEventFromText(link.userId, line, capture);
    } else if (line.startsWith('新增')) {
      await this.todos.createTodoFromText(link, line, capture);
    } else if (line.startsWith('買股') || line.startsWith('賣股')) {
      await this.stocks.tryStockCommand(link.userId, line, capture);
    } else if (line.startsWith('支出') || line.startsWith('收入')) {
      await this.finance.tryFinanceCommand(link.userId, line, capture);
    } else if (line.startsWith('借出') || line.startsWith('借入')) {
      await this.loans.tryLoanCommand(link.userId, line, capture);
    } else if (line.startsWith('代墊')) {
      await this.loans.tryAdvanceCommand(link.userId, line, capture);
    } else {
      return `看不懂「${line}」`;
    }

    return results.join(' ') || `「${line}」沒有任何回應`;
  }

  // --- 記帳 ---

  /** 語音訊息（2026-10-01）：Gemini 轉成文字後（2026-10-02 AI 改 Claude 後語音還是用 Gemini，Claude 聽不到聲音），跟打字完全走同一條路，
   * 回覆最上面加一行「🎤 我聽到：…」讓使用者確認有沒有聽錯。 */
  private async handleAudioMessage(link: LineAccountLink, messageId: string | undefined, replyToken: string) {
    if (!messageId) return;
    const apiKey = (await this.usersService.findById(link.userId))?.geminiApiKey ?? null;
    if (!apiKey) {
      await this.out.reply(replyToken, '語音要用 Gemini 轉成文字，請先到 App 左側「AI 設定」貼上 Gemini 金鑰（免費的就可以）；或直接打字給我。');
      return;
    }
    let audio: Buffer;
    try {
      audio = await this.out.fetchLineMessageContent(messageId);
    } catch (error) {
      this.logger.warn(`語音下載失敗 link=${link.id}: ${String(error)}`);
      await this.out.reply(replyToken, '語音下載失敗，請再傳一次看看。');
      return;
    }
    let text: string | null;
    try {
      text = await this.voice.transcribe(link.userId, apiKey, audio);
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) throw error;
      await this.out.reply(replyToken, `🎤 語音轉文字用的是 Gemini：${aiUnavailableMessage(error)}`);
      return;
    }
    if (!text) {
      await this.out.reply(replyToken, '🎤 我沒聽清楚，可以再說一次，或直接打字給我。');
      return;
    }
    await this.out.replyPrefix.run(`🎤 我聽到：「${text}」`, () => this.handleTextForLinkedUser(link, text, replyToken));
  }

  /** 「AI 用量」：管理員看所有人；其他人只看自己的。 */
  /** LINE「旅行」：還沒去／正在玩的，加最近一趟去過的。 */
  private async tripsText(userId: string): Promise<string> {
    const trips = await this.trips.list(userId);
    const active = trips.filter((t) => t.status !== 'done');
    const last = trips.find((t) => t.status === 'done');
    if (!active.length && !last) {
      return '✈️ 還沒有排旅行\n\n直接跟我說「11/1～11/5 想去東京，兩個人」，我幫你排行程、估預算、列行李清單。';
    }
    const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
    const money = (n: number) => Math.round(n).toLocaleString('en-US');
    const lines = ['✈️ 我的旅行'];
    for (const t of active) {
      const when = t.status === 'ongoing' ? '旅行中' : t.daysUntil === 0 ? '今天出發' : `還有 ${t.daysUntil} 天`;
      lines.push('', `・${t.destination}（${md(t.startDate)}～${md(t.endDate)}，${when}）`);
      if (t.budgetTotal) lines.push(`　預估 ${money(t.budgetTotal)} 元${t.spent != null ? `，目前花了 ${money(t.spent)}` : ''}`);
      const packing = packingText(t.packingList);
      if (packing && t.status === 'upcoming') lines.push(`　${packing}`);
    }
    if (last) lines.push('', `上一趟：${last.destination}（${md(last.startDate)}～${md(last.endDate)}）${last.spent != null ? `花了 ${money(last.spent)} 元` : ''}`);
    lines.push('', '要看某一天的行程、改行程、行李打勾，直接跟我說就好。');
    return lines.join('\n');
  }

  private async aiUsageText(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId);
    if (user?.isPlatformAdmin) return this.aiUsageAdmin.summaryText();
    const h = await this.aiUsage.history(userId);
    const usd = (n: number) => `$${n.toFixed(3)}`;
    type Period = (typeof h)['today'];
    const line = (label: string, p: Period) => [
      `${label}：${p.count} 次、約 ${usd(p.costUsd)}`,
      ...p.byProvider.filter((x) => x.count > 0).map((x) => `　${x.provider} ${x.count} 次 ${usd(x.costUsd)}`),
    ];
    return [
      '🤖 你的 AI 用量（用你自己的 Claude／Gemini 金鑰）',
      ...line('今天', h.today),
      ...line('近 7 天', h.thisWeek),
      ...line('本月', h.thisMonth),
      '（金額是估的，實際以 Anthropic／Google 帳單為準）',
      ...featureUsageLines(h.featureUsage),
    ].join('\n');
  }
}
