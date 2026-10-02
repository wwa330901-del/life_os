import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { VoiceTranscriberService } from './voice-transcriber.service';
import { ReceiptReaderService, receiptToAgentText } from './receipt-reader.service';
import { SYSTEM_TROUBLE_MESSAGE } from '../error-report/system-trouble';
import { aiUnavailableMessage, AiUnavailableError } from '../ai/ai-errors';
import { needClaudeKey } from '../ai/claude';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { AiUsageAdminService } from '../admin/ai-usage-admin.service';
import { SubscriptionService } from '../finance/subscription.service';
import { subscriptionsText } from '../finance/subscriptions';
import { WishlistService } from '../finance/wishlist.service';
import { RetirementService } from '../finance/retirement.service';
import { TripsService } from '../trips/trips.service';
import { packingText } from '../trips/trip';
import { UserLocationService } from '../users/user-location.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { FinanceBudgetsService } from '../finance/finance-budgets.service';
import { FinanceLoansService } from '../finance/finance-loans.service';
import { FinanceAdvancesService } from '../finance/finance-advances.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { StocksHoldingsService } from '../stocks/stocks-holdings.service';
import { StocksRecurringService } from '../stocks/stocks-recurring.service';
import { computeSettlementDate } from '../stocks/stock-settlement-schedule';
import { KnowledgeItemsService } from '../knowledge/knowledge-items.service';
import { KnowledgeAnalysisPipeline } from '../knowledge/knowledge-analysis-pipeline.service';
import { InstagramFetcherService } from '../knowledge/instagram-fetcher.service';
import { UsersService } from '../users/users.service';
import { TodosService } from '../todos/todos.service';
import { LifeGoalsService } from '../life-goals/life-goals.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { LifeReviewService } from '../life-review/life-review.service';
import { DailyBriefService } from '../daily-brief/daily-brief.service';
import { FinancePlanService } from '../finance/finance-plan.service';
import { FinanceHealthService, formatFinanceHealth } from '../finance/finance-health.service';
import { formatGoalProgress } from '../life-goals/life-goal-reminder.service';
import {
  isInstagramUrl,
  INSTAGRAM_UNSUPPORTED_MESSAGE,
} from '../knowledge/content-fetcher.service';
import {
  FinanceAccountType,
  FinanceCategoryKind,
  FinanceTransactionType,
  FinanceLoanDirection,
  StockTransactionType,
  LifeGoalStatus,
} from '../../generated/prisma/client.js';
import type { LineAccountLink } from '../../generated/prisma/client.js';
import {
  taipeiTodayRange,
  taipeiCurrentMonth,
  taipeiWallClockToUtc,
  formatTaipeiDateTime,
} from '../common/taipei-date';

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; id?: string; text?: string; latitude?: number; longitude?: number; address?: string; title?: string };
  postback?: { data?: string };
}

/** A handler's one output message, decoupled from *how* it gets to the
 * user — a single-line command replies via this straight to LINE
 * (`(text) => this.reply(replyToken, text)`); a line inside a 條列式批次
 * message instead pushes into an array to fold into one combined reply
 * (see `tryBatchLine`). Every 登陸-style command (記帳/代辦新增/股票買賣/
 * 新增行事曆) takes one of these instead of a bare `replyToken` so it works
 * unchanged in both contexts. */
type Responder = (text: string) => Promise<void>;

/** A LINE-command separator can be whitespace, common punctuation, or
 * nothing at all (fields typed glued together) — this app's users wanted
 * the parser to be lenient rather than making them remember an exact
 * delimiter, so every free-text command strips these opportunistically
 * instead of splitting on them. */
const SEPARATORS = /[\s\-+*/,，、]+/;
const LEADING_SEPARATORS = new RegExp(`^${SEPARATORS.source}`);
const EDGE_SEPARATORS = new RegExp(
  `^${SEPARATORS.source}|${SEPARATORS.source}$`,
  'g',
);

const LINK_CODE_TTL_MINUTES = 10;

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
  private readonly logger = new Logger(LineService.name);
  private readonly channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';
  private readonly channelAccessToken =
    process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccountsService: FinanceAccountsService,
    private readonly financeTransactionsService: FinanceTransactionsService,
    private readonly financeBudgetsService: FinanceBudgetsService,
    private readonly financeLoansService: FinanceLoansService,
    private readonly financeAdvancesService: FinanceAdvancesService,
    private readonly calendarEventsService: CalendarEventsService,
    private readonly stocksHoldingsService: StocksHoldingsService,
    private readonly stocksRecurringService: StocksRecurringService,
    private readonly knowledgeItemsService: KnowledgeItemsService,
    private readonly knowledgeAnalysisPipeline: KnowledgeAnalysisPipeline,
    private readonly instagramFetcherService: InstagramFetcherService,
    private readonly usersService: UsersService,
    private readonly todosService: TodosService,
    private readonly lifeGoalsService: LifeGoalsService,
    private readonly aiAgent: AiAgentService,
    private readonly lifeReview: LifeReviewService,
    private readonly financeHealth: FinanceHealthService,
    private readonly dailyBrief: DailyBriefService,
    private readonly financePlan: FinancePlanService,
    private readonly voice: VoiceTranscriberService,
    private readonly receiptReader: ReceiptReaderService,
    private readonly aiUsage: AiUsageService,
    private readonly aiUsageAdmin: AiUsageAdminService,
    private readonly subscriptionService: SubscriptionService,
    private readonly wishlist: WishlistService,
    private readonly retirement: RetirementService,
    private readonly trips: TripsService,
    private readonly userLocation: UserLocationService,
  ) {}

  /** While handling a 語音訊息, the transcript to show above whatever reply
   * the normal text flow sends — so the user can see what was heard. */
  private readonly replyPrefix = new AsyncLocalStorage<string>();

  /** Per webhook event: whether the 萬用 AI threw while handling it. */
  private readonly eventState = new AsyncLocalStorage<{ aiFailed: boolean }>();

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
      this.eventState.enterWith({ aiFailed: false });

      try {
        const link = await this.prisma.lineAccountLink.findUnique({
          where: { lineUserId },
        });

        if (event.type === 'message' && event.message?.type === 'image') {
          if (!link) continue;
          await this.handleImageMessage(link, event.message.id, replyToken);
          continue;
        }

        // 「＋」→「位置資訊」：記成使用者目前的位置（問天氣、找附近的用）。
        if (event.type === 'message' && event.message?.type === 'location') {
          if (!link) continue;
          const { latitude, longitude, address, title } = event.message;
          if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
          const name = (title || address || '你傳的位置').replace(/^\d{3,6}/, '').replace(/^(台灣|臺灣)/, '').slice(0, 60);
          await this.userLocation.updateFromLine(link.userId, latitude, longitude, name);
          await this.reply(replyToken, `📍 記住你現在在「${name}」了。問天氣、找附近吃的沒講地點，就用這裡。`);
          continue;
        }

        if (event.type === 'message' && event.message?.type === 'audio') {
          if (!link) continue;
          await this.handleAudioMessage(link, event.message.id, replyToken);
          continue;
        }

        if (event.type === 'message' && event.message?.type === 'video') {
          if (!link) continue;
          await this.handleVideoMessage(
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
          await this.handleTextForLinkedUser(link, text, replyToken);
        } else {
          await this.tryCompleteLinking(lineUserId, text, replyToken);
        }
      } catch (error) {
        this.logger.error('Failed to handle LINE event', error);
        // 細節已通知管理員；使用者只看到「已通知管理員」（reply 自己會吞錯，
        // replyToken 已經用過就只是送不出去）。
        await this.reply(replyToken, SYSTEM_TROUBLE_MESSAGE);
      }
    }
  }

  private async tryCompleteLinking(
    lineUserId: string,
    code: string,
    replyToken: string,
  ) {
    const pending = await this.prisma.lineAccountLink.findUnique({
      where: { linkCode: code },
    });
    if (
      !pending ||
      !pending.linkCodeExpiresAt ||
      pending.linkCodeExpiresAt < new Date()
    ) {
      await this.reply(
        replyToken,
        '綁定碼無效或已過期，請到元序 App 的記帳頁重新產生一組綁定碼。',
      );
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

  // --- Routing ---

  /** Messages that clearly want the AI (goals, check-ins, "幫我排…") even
   * while no AI conversation is active — routed to it before the
   * batch/command parsers so e.g. a multi-line book reflection isn't split
   * into per-line 記帳 commands. */
  private static readonly AI_FIRST_HINT = /目標|打卡|讀完|看完|讀了一本|最喜歡的一句|幫我|安排|排時間|提醒我|算命|想算|占卜|卜卦|運勢|理財|財務規劃|卡費|信用卡|結帳日|繳款日|記住|記得|忘掉|生日|紀念日|週年|約好|還款日|借|還我|天氣|下雨|帶傘|氣溫|想買|想要買|購物車|買得起|撥.*買東西|旅行|旅遊|出國|去玩|行李|退休/;

  private static readonly OVERVIEW_KEYWORDS = ['財務總覽', '總覽', '總覽財務'];
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

  private static buildGuideText(hasAi: boolean): string {
    const aiPart = hasAi
      ? [
          '💬 直接跟我講話就好，不用記指令',
          '🎤 懶得打字就傳語音，效果一樣',
          '',
          '💰 記帳',
          '「午餐 120」「昨天加油 1500 刷卡」',
          '收據、發票直接拍照傳給我，自動讀金額記帳',
          '「這個月花了多少？」「上週吃飯花多少」',
          '「國泰卡每月 5 號結帳、20 號繳款，從台新扣」設好會提醒繳卡費',
          '「借小明 5000，他說月底還」到期前會提醒你去收',
          '傳「訂閱」看每月固定扣的錢；分類花太兇或有特別大的單筆，晚上 9 點會提醒你',
          '',
          '🛒 購物車',
          '「想買 AirPods 7490」我會排什麼時候買得起；傳「購物車」看清單',
          '',
          '✈️ 旅行',
          '「11/1～11/5 想去東京，兩個人，喜歡吃」我排行程、估預算、列行李',
          '可以放進行事曆、放進購物車存錢；出發前 7 天、前 1 天提醒行李和天氣',
          '',
          '🧓 退休試算',
          '傳「退休試算」，或問「我幾歲可以退休？」「如果每月多存 5000 呢？」',
          '',
          '🧠 記住你的事',
          '「記住我不吃牛」「我太太叫小美，喜歡多肉植物」',
          '「媽媽生日是農曆 9 月 1 號」前 7 天、前 1 天、當天提醒',
          '',
          '✅ 代辦',
          '「提醒我週五交報告」「報告做完了」',
          '「我還有什麼沒做？」',
          '',
          '📅 行程',
          '「明天下午三點看牙醫」',
          '「幫我排兩小時健身」（我會找空檔問你）',
          '「這週有什麼行程？」',
          '',
          '🎯 人生目標',
          '「今天運動了」「體重現在72」',
          '「看完一本書」（我會問你心得）',
          '「我想今年存到50萬」（幫你開新目標）',
          '',
          '🗂 找收藏',
          '「之前存的那篇理財文章」「信義區有什麼好吃的」',
          '「最近有什麼展可以看？」',
          '',
          '🧭 規劃',
          '「幫我規劃這週」「今天先做什麼好？」',
          '「這個月還能花多少？」',
          '',
          '📝 日記',
      '直接講今天發生的事，例如「今天跟家人吃飯很開心」',
      '每晚 9:30 沒寫會問你（傳「關閉日記提醒」可以關掉）',
      '',
      '🩺 財務',
      '傳「財務健檢」看 0～100 分跟改善建議',
      '說「我月薪 5 萬，5 號發薪」設定固定薪資，再傳「財務規劃」拿每月分配跟建議預算（回「套用預算」一鍵設好）',
      '',
      '⏰ 提醒',
      '每天 8 點早報（今天行程、代辦、預算），有時間的代辦前 1 小時提醒；傳「早報」隨時看',
      '',
      '🔮 算命（梅花易數）',
      '說一次生日就會記住「我是 1990/5/3 早上 8 點生的」，之後直接說「我想算這次換工作順不順」',
      '',
      '📊 回顧',
      '傳「週回顧」「月回顧」，週日晚上和每月 1 號也會自動傳給你',
      '',
      '也可以單純聊天、問意見 🙂',
          '',
        ]
      : [
          '⚠️ 還沒設定 AI 金鑰，只能用固定指令。',
          '到元序 App 左側「AI 設定」貼上 Claude 金鑰後，就能直接跟我講話。',
          '',
        ];
    return [
      ...aiPart,
      '📚 知識庫',
      '傳連結／圖片／影片給我，自動分析收藏',
      '',
      '📈 股票',
      '「我的股票賺多少？」「幫我分析台積電的走勢」',
      '「買了 3 張 0050 成交 152」（直接講就記）',
      '',
      '💳 借貸／代墊',
      '「借小明 3000」「小明還我 1000」「代墊材料費 5000」',
      '「誰還欠我錢？」',
      '',
      '✏️ 改錯或刪掉',
      '「剛剛那筆改成 150」「刪掉昨天的計程車」',
    ].join('\n');
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
  ) {
    const linkId = link.id;
    const userId = link.userId;

    // --- 知識庫：任何等待中的狀態一律優先處理，因為此時使用者打的任何文字
    // （包含剛好也是選單指令字面的內容）都是在回答那個等待中的問題，不是在
    // 下一個新指令。
    if (link.pendingKnowledgeItemId) {
      await this.tryResolveKnowledgeCategoryDecision(link, text, replyToken);
      return;
    }
    if (link.pendingKnowledgeLocationQueryCategory) {
      await this.resolveKnowledgeLocationQuery(link, text, replyToken);
      return;
    }
    if (link.pendingExhibitionScheduleItemId) {
      await this.resolveExhibitionSchedule(link, text, replyToken);
      return;
    }

    if (text === '美食' || text === '景點') {
      await this.prisma.lineAccountLink.update({
        where: { id: linkId },
        data: { pendingKnowledgeLocationQueryCategory: text },
      });
      await this.reply(replyToken, `請輸入地點，我幫你找附近記錄過的${text}。`);
      return;
    }
    if (text === '展覽') {
      await this.sendUpcomingExhibitions(userId, replyToken);
      return;
    }
    if (text === '知識庫') {
      await this.reply(
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

    const url = this.extractUrl(text);
    if (url) {
      await this.captureKnowledgeUrl(userId, url, replyToken);
      return;
    }

    // 「分析 <貼上的文字>」——知識庫的第四種擷取入口（網址/圖片/影片都不需要
    // 前綴，但貼上的純文字沒有明確訊號分辨是要收藏還是打錯指令，所以這個入
    // 口需要明確的「分析」前綴，2026-08-05 使用者明確選擇這個設計）。放在網
    // 址擷取之後、批次多行判斷之前，理由跟網址擷取一樣——真實文章/筆記內容
    // 常常是多行的，要在被誤判成批次逐行指令之前先攔下來當一整塊處理。
    if (text.startsWith('分析')) {
      await this.captureKnowledgeText(userId, text, replyToken);
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
      (AiAgentService.isConversationActive(link) ||
        AiAgentService.isJournalPromptActive(link) ||
        AiAgentService.divinationFeedbackPending(link) != null ||
        LineService.AI_FIRST_HINT.test(text));
    // 關鍵字明顯要做事 → 直接 Agent；只是對話進行中 → 讓分流判斷。
    // （天氣字眼只讓 AI 先接，不強制 Agent——輕量 AI 自己會查天氣。）
    const forceAgent = LineService.AI_FIRST_HINT.test(text.replace(/天氣|下雨|帶傘|氣溫/g, ''));
    if (aiFirst && (await this.tryAiAgent(link, text, replyToken, claudeApiKey, forceAgent))) return;

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
      const summaries: string[] = [];
      for (let i = 0; i < batchLines.length; i++) {
        const result = await this.tryBatchLine(link, batchLines[i]);
        summaries.push(`${i + 1}. ${result}`);
      }
      await this.reply(replyToken, summaries.join('\n'));
      return;
    }

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
      await this.sendTodoHelp(linkId, userId, replyToken);
      return;
    }
    // 新增行程／代辦現在一定要選存到 Google 還是 iPhone，固定指令沒辦法問，
    // 有 AI 的人交給 AI（它會問）；沒有的維持原本行為。
    if (
      claudeApiKey &&
      !aiFirst &&
      text.startsWith('新增') &&
      (await this.tryAiAgent(link, text, replyToken, claudeApiKey, true))
    ) {
      return;
    }
    if (text.startsWith('新增行事曆')) {
      await this.createCalendarEventFromText(userId, text, (msg) => this.reply(replyToken, msg));
      return;
    }
    if (text === '今日行事曆') {
      await this.sendTodayCalendarEvents(userId, replyToken);
      return;
    }
    if (text.startsWith('新增')) {
      await this.createTodoFromText(link, text, (msg) => this.reply(replyToken, msg));
      return;
    }
    if (text.startsWith('完成')) {
      await this.completeTodoByNumber(linkId, text, replyToken);
      return;
    }
    if (text.startsWith('改期')) {
      await this.rescheduleTodoByNumber(linkId, text, replyToken);
      return;
    }

    if (text === '股票買賣') {
      await this.sendStockHelp(userId, replyToken);
      return;
    }
    if (text === '持股總覽' || text === '持股') {
      await this.sendStockHoldings(userId, replyToken);
      return;
    }

    if (text === '借貸列表') {
      await this.sendLoanList(linkId, userId, replyToken);
      return;
    }
    if (text.startsWith('還款')) {
      await this.repayLoanByNumber(linkId, text, replyToken);
      return;
    }
    if (text === '代墊列表') {
      await this.sendAdvanceList(linkId, userId, replyToken);
      return;
    }
    if (text.startsWith('收回代墊')) {
      await this.repayAdvanceByNumber(linkId, text, replyToken);
      return;
    }

    if (text === '人生目標') {
      await this.sendLifeGoals(userId, replyToken);
      return;
    }

    if (text === '關閉日記提醒' || text === '開啟日記提醒') {
      const enabled = text === '開啟日記提醒';
      await this.prisma.lineAccountLink.update({
        where: { id: linkId },
        data: { journalReminderEnabled: enabled, journalPromptAt: null },
      });
      await this.reply(
        replyToken,
        enabled ? '好，之後每晚 9:30 沒寫日記會問你一聲 📝' : '好，不會再每晚問你了。想寫的時候直接跟我說就好。',
      );
      return;
    }

    if (text === '理財評估' || text === '財務規劃') {
      try {
        const { plan, structured } = await this.financePlan.generate(userId);
        const tail = structured.budgets.length ? '想照建議設預算，回我「套用預算」就幫你設好。' : '';
        await this.reply(replyToken, ['💼 財務規劃', '', plan, ...(tail ? ['', tail] : [])].join('\n'));
      } catch (error) {
        await this.reply(replyToken, error instanceof Error ? error.message : '財務規劃產生失敗');
      }
      return;
    }
    if (text === '套用預算') {
      try {
        const applied = await this.financePlan.applyLatestBudgets(userId);
        await this.reply(replyToken, applied.length ? `✅ 預算設好了：\n${applied.map((a) => `・${a}`).join('\n')}\n超過 80% 和超支時會提醒你。` : '建議的分類找不到，沒有設定任何預算。');
      } catch (error) {
        await this.reply(replyToken, error instanceof Error ? error.message : '套用失敗');
      }
      return;
    }
    if (text === '早報') {
      await this.reply(replyToken, (await this.dailyBrief.build(userId)) ?? '今天沒有行程、到期的代辦，也沒有要注意的預算 👍');
      return;
    }
    if (text === '關閉早報' || text === '開啟早報') {
      const enabled = text === '開啟早報';
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { morningBriefEnabled: enabled } });
      await this.reply(replyToken, enabled ? '好，每天早上 8 點會傳今天的重點給你 ☀️' : '好，不會再傳早報了。想看的時候傳「早報」就好。');
      return;
    }
    if (text === '關閉花費提醒' || text === '開啟花費提醒') {
      const enabled = text === '開啟花費提醒';
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { spendingAlertEnabled: enabled } });
      await this.reply(replyToken, enabled ? '好，哪個分類花太兇或有特別大的單筆，晚上 9 點會提醒你。' : '好，不會再傳花費提醒了。');
      return;
    }
    if (text === '關閉旅行提醒' || text === '開啟旅行提醒') {
      const enabled = text === '開啟旅行提醒';
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { tripReminderEnabled: enabled } });
      await this.reply(replyToken, enabled ? '好，出發前 7 天、前 1 天和回來隔天會提醒你。' : '好，不會再傳旅行提醒了。');
      return;
    }
    if (text === '旅行' || text === '我的旅行') {
      await this.reply(replyToken, await this.tripsText(userId));
      return;
    }
    if (text === '關閉訂閱提醒' || text === '開啟訂閱提醒') {
      const enabled = text === '開啟訂閱提醒';
      await this.prisma.lineAccountLink.update({ where: { id: linkId }, data: { subscriptionReminderEnabled: enabled } });
      await this.reply(replyToken, enabled ? '好，訂閱快扣款前 3 天會提醒你。' : '好，不會再傳訂閱續約提醒了。');
      return;
    }

    if (text === '財務健檢') {
      const health = await this.financeHealth.forUser(userId);
      await this.reply(replyToken, health ? formatFinanceHealth(health) : '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    if (text === '週回顧' || text === '月回顧') {
      const review = await this.lifeReview.build(userId, text === '週回顧' ? 'week' : 'month');
      await this.reply(replyToken, review ?? '這段時間還沒有任何記錄可以回顧。');
      return;
    }

    if (text === '購物車') {
      await this.reply(replyToken, await this.wishlist.text(userId));
      return;
    }
    if (text === '退休試算' || text === '退休') {
      await this.reply(replyToken, await this.retirement.text(userId));
      return;
    }
    if (text === '訂閱' || text === '我的訂閱') {
      const subs = await this.subscriptionService.listForUser(userId);
      await this.reply(replyToken, subs ? subscriptionsText(subs) : '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    if (LineService.AI_USAGE_KEYWORDS.includes(text)) {
      await this.reply(replyToken, await this.aiUsageText(userId));
      return;
    }
    if (LineService.GUIDE_KEYWORDS.includes(text)) {
      await this.reply(replyToken, LineService.buildGuideText(claudeApiKey != null));
      return;
    }

    if (text.startsWith('查詢')) {
      await this.handleAiQuery(link, text, replyToken);
      return;
    }

    const replyOnce: Responder = (msg) => this.reply(replyToken, msg);
    if (await this.tryFinanceCommand(userId, text, replyOnce, claudeApiKey != null)) return;
    if (await this.tryTransferCommand(userId, text, replyOnce)) return;
    if (await this.tryLoanCommand(userId, text, replyOnce)) return;
    if (await this.tryAdvanceCommand(userId, text, replyOnce)) return;
    if (await this.tryStockCommand(userId, text, replyOnce)) return;
    if (await this.tryStockDcaReply(userId, text, replyToken)) return;

    // 固定指令都對不上：交給 AI（「午餐 120」「體重現在 72」「下週三下午兩點
    // 跟客戶開會」），它也處理不了才回「看不懂」。前面已經問過 AI 的不再問。
    if (claudeApiKey && !aiFirst && (await this.tryAiAgent(link, text, replyToken, claudeApiKey))) return;
    if (this.eventState.getStore()?.aiFailed) {
      await this.reply(replyToken, SYSTEM_TROUBLE_MESSAGE);
      return;
    }

    await this.reply(
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
      await this.createCalendarEventFromText(link.userId, line, capture);
    } else if (line.startsWith('新增')) {
      await this.createTodoFromText(link, line, capture);
    } else if (line.startsWith('買股') || line.startsWith('賣股')) {
      await this.tryStockCommand(link.userId, line, capture);
    } else if (line.startsWith('支出') || line.startsWith('收入')) {
      await this.tryFinanceCommand(link.userId, line, capture);
    } else if (line.startsWith('借出') || line.startsWith('借入')) {
      await this.tryLoanCommand(link.userId, line, capture);
    } else if (line.startsWith('代墊')) {
      await this.tryAdvanceCommand(link.userId, line, capture);
    } else {
      return `看不懂「${line}」`;
    }

    return results.join(' ') || `「${line}」沒有任何回應`;
  }

  // --- 記帳 ---

  private async sendFinanceHelp(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.reply(
        replyToken,
        '找不到你的個人空間，請先到元序 App 登入一次。',
      );
      return;
    }
    const [categories, accounts] = await Promise.all([
      this.prisma.financeCategory.findMany({
        where: { spaceId: space.id },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.financeAccount.findMany({
        where: { spaceId: space.id },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const expenseCats = this.formatCategoryOptions(
      categories,
      FinanceCategoryKind.EXPENSE,
    );
    const incomeCats = this.formatCategoryOptions(
      categories,
      FinanceCategoryKind.INCOME,
    );

    const accountList = accounts.length ? accounts.map((a) => a.name).join('、') : '（還沒有，請到 App 新增）';
    await this.reply(
      replyToken,
      [
        '💰 記帳',
        '支出300午餐現金',
        '',
        `支出分類　${expenseCats}`,
        `收入分類　${incomeCats}`,
        `帳戶　　　${accountList}`,
        '（帳戶名稱要打對，打錯會報錯）',
        '',
        '💱 轉帳',
        '轉帳 現金 1000 玉山銀行',
      ].join('\n'),
    );
  }

  /** Categories that can actually be recorded against directly — a 母分類
   * with children can't (the child is the real classification), so it's
   * excluded; everything else (a childless top-level category, or a
   * 子分類 itself) is a leaf. */
  private leafCategories<T extends { id: string; parentId: string | null }>(
    categories: T[],
  ): T[] {
    const parentIds = new Set(
      categories.filter((c) => c.parentId).map((c) => c.parentId!),
    );
    return categories.filter((c) => !parentIds.has(c.id));
  }

  /** "分類、母分類（子1、子2）、..." — every 母分類 shows its 子分類 in
   * parentheses right after it so the LINE reply reflects the same
   * hierarchy as the app, instead of a flat list of leaf names that hides
   * which children belong under which parent. */
  private formatCategoryOptions(
    categories: {
      id: string;
      name: string;
      kind: FinanceCategoryKind;
      parentId: string | null;
    }[],
    kind: FinanceCategoryKind,
  ): string {
    const ofKind = categories.filter((c) => c.kind === kind);
    const topLevel = ofKind.filter((c) => !c.parentId);
    const parts = topLevel.map((c) => {
      const children = ofKind
        .filter((child) => child.parentId === c.id)
        .map((child) => child.name);
      return children.length ? `${c.name}（${children.join('、')}）` : c.name;
    });
    return parts.length ? parts.join('、') : '（還沒有，請到 App 新增）';
  }

  /** Returns true once it's decided this text *was* a 記帳 command attempt
   * (even if parsing failed, in which case it already sent an error reply)
   * — false only means "not a 記帳 command at all", so the caller can keep
   * trying other interpretations. */
  /** `aiAvailable`: when the fixed format can't be parsed (or 帳戶 is
   * missing), return false so the message falls through to the LINE AI,
   * which can work it out or ask — instead of a format error. */
  private async tryFinanceCommand(
    userId: string,
    text: string,
    respond: Responder,
    aiAvailable = false,
  ): Promise<boolean> {
    if (!text.startsWith('支出') && !text.startsWith('收入')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }
    const [categories, accounts] = await Promise.all([
      this.prisma.financeCategory.findMany({ where: { spaceId: space.id } }),
      this.prisma.financeAccount.findMany({
        where: { spaceId: space.id },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const parsed = this.parseFinanceCommand(
      text,
      this.leafCategories(categories),
      accounts,
    );
    if (!parsed) {
      if (aiAvailable) return false;
      await respond('看不懂記帳格式，傳「記帳」看範例跟目前可用的分類/帳戶。');
      return true;
    }

    if (accounts.length === 0) {
      await respond('你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }
    if (!parsed.accountId) {
      // 沒講帳戶：交給 AI 猜最常用的帳戶再跟使用者確認（2026-09-30）。
      if (aiAvailable) return false;
      await respond(
        `帳戶錯誤，請在指令裡包含正確的帳戶名稱：${accounts.map((a) => a.name).join('、')}`,
      );
      return true;
    }
    const accountId = parsed.accountId;

    const transactionDate = new Date();
    await this.prisma.financeTransaction.create({
      data: {
        spaceId: space.id,
        type: parsed.type,
        amount: parsed.amount,
        accountId,
        categoryId: parsed.categoryId,
        date: transactionDate,
        note: parsed.note,
      },
    });
    if (parsed.type === FinanceTransactionType.EXPENSE && parsed.categoryId) {
      await this.financeBudgetsService.notifyIfOverspent(
        space.id,
        parsed.categoryId,
        transactionDate,
      );
    }

    const account = accounts.find((a) => a.id === accountId);
    const category = parsed.categoryId
      ? categories.find((c) => c.id === parsed.categoryId)
      : null;
    const typeLabel =
      parsed.type === FinanceTransactionType.INCOME ? '收入' : '支出';
    await respond(
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
   * without needing a multi-step flow. Whatever's left becomes the note.
   * 帳戶 is required (2026-08-06) — `accountId` staying null here (no
   * substring in the message matched any of the caller's real accounts)
   * makes `tryFinanceCommand` reply with an error instead of silently
   * filing the transaction under the first account; there's no way to
   * tell "帳戶沒打" apart from "帳戶打錯字" with substring matching, so
   * both are now treated the same — say the right name. */
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

    const kind =
      type === FinanceTransactionType.INCOME
        ? FinanceCategoryKind.INCOME
        : FinanceCategoryKind.EXPENSE;
    let categoryId: string | null = null;
    for (const c of categories
      .filter((c) => c.kind === kind)
      .sort((a, b) => b.name.length - a.name.length)) {
      const idx = rest.indexOf(c.name);
      if (idx !== -1) {
        categoryId = c.id;
        rest = rest.slice(0, idx) + rest.slice(idx + c.name.length);
        break;
      }
    }

    let accountId: string | null = null;
    for (const a of [...accounts].sort(
      (x, y) => y.name.length - x.name.length,
    )) {
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

  // --- 轉帳（自己帳戶間）---

  /** "轉帳 轉出帳戶 金額 轉入帳戶 備註" (2026-08-06) — unlike 記帳's single
   * account, this needs to identify TWO, so it can't just scan the whole
   * remaining text for any account-name substring the way 記帳/股票買賣 do
   * (no way to tell which occurrence is which). Splits on the amount
   * instead — text before it is the 轉出帳戶 zone, text after is
   * 轉入帳戶+備註 — and matches each zone independently. Both accounts are
   * required (same "帳戶必填" reasoning as 記帳/股票買賣); actual business
   * rules (can't transfer to the same account, etc.) are `
   * FinanceTransactionsService.validate`'s job, not re-implemented here. */
  private async tryTransferCommand(
    userId: string,
    text: string,
    respond: Responder,
  ): Promise<boolean> {
    if (!text.startsWith('轉帳')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    if (accounts.length < 2) {
      await respond('轉帳需要至少兩個記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增。');
      return true;
    }

    const parsed = this.parseTransferCommand(text, accounts);
    if (!parsed) {
      await respond(
        `看不懂轉帳格式，請用「轉帳 轉出帳戶 金額 轉入帳戶 備註」這種格式，例如「轉帳 現金 1000 玉山銀行」。目前帳戶：${accounts.map((a) => a.name).join('、')}`,
      );
      return true;
    }

    try {
      await this.financeTransactionsService.create(userId, space.id, {
        type: FinanceTransactionType.TRANSFER,
        amount: parsed.amount,
        accountId: parsed.fromAccountId,
        toAccountId: parsed.toAccountId,
        date: new Date().toISOString(),
        note: parsed.note ?? undefined,
      });
      const from = accounts.find((a) => a.id === parsed.fromAccountId);
      const to = accounts.find((a) => a.id === parsed.toAccountId);
      await respond(
        `已記錄轉帳 ${parsed.amount.toLocaleString('en-US')}（${from?.name ?? ''} → ${to?.name ?? ''}）${parsed.note ? ' · ' + parsed.note : ''}`,
      );
    } catch (error) {
      await respond(error instanceof Error ? error.message : '轉帳記錄失敗了，稍後再試一次。');
    }
    return true;
  }

  private parseTransferCommand(
    text: string,
    accounts: { id: string; name: string }[],
  ): { fromAccountId: string; amount: number; toAccountId: string; note: string | null } | null {
    const rest = text.slice(2).replace(LEADING_SEPARATORS, '');

    const amountMatch = rest.match(/\d+(\.\d+)?/);
    if (!amountMatch || amountMatch.index === undefined) return null;
    const before = rest.slice(0, amountMatch.index);
    const amount = Number(amountMatch[0]);
    if (!(amount > 0)) return null;
    const after = rest
      .slice(amountMatch.index + amountMatch[0].length)
      .replace(LEADING_SEPARATORS, '');

    const fromAccountId = this.matchAccountName(before, accounts);
    if (!fromAccountId) return null;

    const sortedByLength = [...accounts].sort((x, y) => y.name.length - x.name.length);
    let toAccountId: string | null = null;
    let toName = '';
    for (const a of sortedByLength) {
      const idx = after.indexOf(a.name);
      if (idx !== -1) {
        toAccountId = a.id;
        toName = a.name;
        break;
      }
    }
    if (!toAccountId) return null;

    const toIdx = after.indexOf(toName);
    const note =
      (after.slice(0, toIdx) + after.slice(toIdx + toName.length))
        .replace(EDGE_SEPARATORS, '')
        .trim() || null;

    return { fromAccountId, amount, toAccountId, note };
  }

  /** Longest-name-first substring match, same technique 記帳/股票買賣 use
   * for a single account — factored out here since 轉帳 needs it twice
   * (once per zone) rather than duplicating the loop a third time. */
  private matchAccountName(text: string, accounts: { id: string; name: string }[]): string | null {
    for (const a of [...accounts].sort((x, y) => y.name.length - x.name.length)) {
      if (text.indexOf(a.name) !== -1) return a.id;
    }
    return null;
  }

  // --- 借貸（跟人借錢/借錢給人）---

  /** "借出/借入 金額 給/跟對象 [備註]" — always uses the caller's first
   * finance account, since there's no room in this compact command to also
   * name an account (deliberate — unlike 記帳/股票買賣/轉帳, this format
   * never asks for one, so there's nothing to fail to recognize). */
  private async tryLoanCommand(
    userId: string,
    text: string,
    respond: Responder,
  ): Promise<boolean> {
    if (!text.startsWith('借出') && !text.startsWith('借入')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }

    const parsed = this.parseLoanCommand(text);
    if (!parsed) {
      await respond(
        '看不懂借貸格式，請用「借出 3000 給小明」或「借入 5000 跟小華」這種格式。',
      );
      return true;
    }

    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const accountId = accounts[0]?.id;
    if (!accountId) {
      await respond('你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }

    await this.financeLoansService.create(userId, space.id, {
      direction: parsed.direction,
      counterpartyName: parsed.counterpartyName,
      amount: parsed.amount,
      accountId,
      date: new Date().toISOString(),
      note: parsed.note ?? undefined,
    });

    const label =
      parsed.direction === FinanceLoanDirection.LEND
        ? `借出 ${parsed.amount.toLocaleString('en-US')} 給${parsed.counterpartyName}`
        : `借入 ${parsed.amount.toLocaleString('en-US')}（跟${parsed.counterpartyName}）`;
    await respond(`已記錄${label}，傳「借貸列表」查看。`);
    return true;
  }

  /** "給"/"跟" marks where the counterparty name starts — whichever comes
   * first, regardless of direction (lenient, matches this file's general
   * parsing philosophy). Name runs up to the first whitespace/punctuation;
   * anything after that becomes an optional note. */
  private parseLoanCommand(text: string): {
    direction: FinanceLoanDirection;
    amount: number;
    counterpartyName: string;
    note: string | null;
  } | null {
    let rest = text.trim();
    let direction: FinanceLoanDirection;
    if (rest.startsWith('借出')) {
      direction = FinanceLoanDirection.LEND;
      rest = rest.slice(2);
    } else if (rest.startsWith('借入')) {
      direction = FinanceLoanDirection.BORROW;
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

    const giveIdx = rest.indexOf('給');
    const withIdx = rest.indexOf('跟');
    const idx =
      giveIdx === -1 ? withIdx : withIdx === -1 ? giveIdx : Math.min(giveIdx, withIdx);
    if (idx === -1) return null;
    rest = rest.slice(idx + 1);

    const nameMatch = rest.match(/^[^\s，,。.]+/);
    if (!nameMatch) return null;
    const counterpartyName = nameMatch[0];
    const note =
      rest.slice(nameMatch[0].length).replace(LEADING_SEPARATORS, '').trim() || null;
    return { direction, amount, counterpartyName, note };
  }

  /** "借貸列表" — lists only unsettled loans (settled ones would just pile
   * up forever otherwise), numbered so "還款 N 金額" can reference one.
   * Overwrites `lastLoanListIds` every time, same pattern as
   * `lastTodoListIds`. */
  private async sendLoanList(linkId: string, userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    const { items: outstanding } = await this.financeLoansService.list(userId, space.id, {
      settled: false,
    });

    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { lastLoanListIds: outstanding.map((l) => l.id) },
    });

    if (outstanding.length === 0) {
      await this.reply(replyToken, '💰 借貸列表\n\n目前沒有未結清的借貸。');
      return;
    }

    const lines = ['💰 借貸列表（未結清）', ''];
    outstanding.forEach((loan, i) => {
      const label =
        loan.direction === FinanceLoanDirection.LEND
          ? `借給${loan.counterpartyName}`
          : `跟${loan.counterpartyName}借`;
      const principal = loan.initialTransaction?.amount ?? 0;
      lines.push(
        `${i + 1}. ${label}　還剩 ${loan.outstanding.toLocaleString('en-US')}（原 ${principal.toLocaleString('en-US')}）`,
      );
    });
    lines.push('', '傳「還款 編號 金額」登記還款，例如「還款 1 1000」。');
    await this.reply(replyToken, lines.join('\n'));
  }

  /** "還款 編號 金額" — references `lastLoanListIds` from the most recent
   * "借貸列表". Which direction the cash actually moves (settling a LEND
   * vs. a BORROW) is entirely `FinanceLoansService.addRepayment`'s call —
   * this method doesn't need to know or care. */
  private async repayLoanByNumber(linkId: string, text: string, replyToken: string) {
    const match = text.match(/(\d+)\D+(\d+(?:\.\d+)?)/);
    if (!match) {
      await this.reply(
        replyToken,
        '請用「還款 編號 金額」，例如「還款 1 1000」，編號請先傳「借貸列表」查看。',
      );
      return;
    }
    const n = Number(match[1]);
    const amount = Number(match[2]);

    const link = await this.prisma.lineAccountLink.findUnique({ where: { id: linkId } });
    const loanId = link?.lastLoanListIds[n - 1];
    if (!link || !loanId) {
      await this.reply(replyToken, `找不到編號 ${n}，請先傳「借貸列表」看目前的編號。`);
      return;
    }

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: link.userId },
    });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const accountId = accounts[0]?.id;
    if (!accountId) {
      await this.reply(replyToken, '你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return;
    }

    try {
      const updated = await this.financeLoansService.addRepayment(link.userId, space.id, loanId, {
        amount,
        accountId,
        date: new Date().toISOString(),
      });
      await this.reply(
        replyToken,
        `已登記還款 ${amount.toLocaleString('en-US')}，${updated.settled ? '這筆借貸已經結清了！' : `還剩 ${updated.outstanding.toLocaleString('en-US')} 未結清。`}`,
      );
    } catch (error) {
      await this.reply(
        replyToken,
        error instanceof Error ? error.message : '登記還款失敗了，稍後再試一次。',
      );
    }
  }

  // --- 代墊（工作上先幫忙出錢，之後還你）---

  /** "代墊 金額 說明" */
  private async tryAdvanceCommand(
    userId: string,
    text: string,
    respond: Responder,
  ): Promise<boolean> {
    if (!text.startsWith('代墊') || text.startsWith('代墊列表')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }

    const parsed = this.parseAdvanceCommand(text);
    if (!parsed) {
      await respond('看不懂代墊格式，請用「代墊 5000 材料款」這種格式。');
      return true;
    }

    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const accountId = accounts[0]?.id;
    if (!accountId) {
      await respond('你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }

    await this.financeAdvancesService.create(userId, space.id, {
      title: parsed.title,
      amount: parsed.amount,
      accountId,
      date: new Date().toISOString(),
    });

    await respond(`已記錄代墊 ${parsed.amount.toLocaleString('en-US')}（${parsed.title}），傳「代墊列表」查看。`);
    return true;
  }

  private parseAdvanceCommand(text: string): {
    amount: number;
    title: string;
  } | null {
    let rest = text.slice(2).replace(LEADING_SEPARATORS, '');
    const amountMatch = rest.match(/^\d+(\.\d+)?/);
    if (!amountMatch) return null;
    const amount = Number(amountMatch[0]);
    if (!(amount > 0)) return null;
    rest = rest.slice(amountMatch[0].length).replace(LEADING_SEPARATORS, '');

    const title = rest.trim();
    if (!title) return null;
    return { amount, title };
  }

  /** "代墊列表" — same shape as `sendLoanList`, unsettled-only + numbered
   * for "收回代墊 N 金額". */
  private async sendAdvanceList(linkId: string, userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    const { items: outstanding } = await this.financeAdvancesService.list(userId, space.id, {
      settled: false,
    });

    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { lastAdvanceListIds: outstanding.map((a) => a.id) },
    });

    if (outstanding.length === 0) {
      await this.reply(replyToken, '💸 代墊列表\n\n目前沒有未收回的代墊。');
      return;
    }

    const lines = ['💸 代墊列表（未收回）', ''];
    outstanding.forEach((advance, i) => {
      const principal = advance.initialTransaction?.amount ?? 0;
      lines.push(
        `${i + 1}. ${advance.title}　還剩 ${advance.outstanding.toLocaleString('en-US')}（原 ${principal.toLocaleString('en-US')}）`,
      );
    });
    lines.push('', '傳「收回代墊 編號 金額」登記收回，例如「收回代墊 1 1000」。');
    await this.reply(replyToken, lines.join('\n'));
  }

  /** "收回代墊 編號 金額" — references `lastAdvanceListIds`. */
  private async repayAdvanceByNumber(linkId: string, text: string, replyToken: string) {
    const match = text.match(/(\d+)\D+(\d+(?:\.\d+)?)/);
    if (!match) {
      await this.reply(
        replyToken,
        '請用「收回代墊 編號 金額」，例如「收回代墊 1 1000」，編號請先傳「代墊列表」查看。',
      );
      return;
    }
    const n = Number(match[1]);
    const amount = Number(match[2]);

    const link = await this.prisma.lineAccountLink.findUnique({ where: { id: linkId } });
    const advanceId = link?.lastAdvanceListIds[n - 1];
    if (!link || !advanceId) {
      await this.reply(replyToken, `找不到編號 ${n}，請先傳「代墊列表」看目前的編號。`);
      return;
    }

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: link.userId },
    });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const accountId = accounts[0]?.id;
    if (!accountId) {
      await this.reply(replyToken, '你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return;
    }

    try {
      const updated = await this.financeAdvancesService.addRepayment(
        link.userId,
        space.id,
        advanceId,
        { amount, accountId, date: new Date().toISOString() },
      );
      await this.reply(
        replyToken,
        `已登記收回 ${amount.toLocaleString('en-US')}，${updated.settled ? '這筆代墊已經全部收回了！' : `還剩 ${updated.outstanding.toLocaleString('en-US')} 未收回。`}`,
      );
    } catch (error) {
      await this.reply(
        replyToken,
        error instanceof Error ? error.message : '登記收回失敗了，稍後再試一次。',
      );
    }
  }

  /** 個人財務總覽：every account's current balance, today's and this
   * month's income/expense totals, and this month's expense breakdown by
   * category — everything reused from the same services the app's own
   * finance screens call, just formatted as one text reply. */
  private async sendOverview(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.reply(
        replyToken,
        '找不到你的個人空間，請先到元序 App 登入一次。',
      );
      return;
    }

    const month = taipeiCurrentMonth();
    const { start: todayStart, end: todayEnd } = taipeiTodayRange();

    const [accounts, monthSummary, todayTransactions] = await Promise.all([
      this.financeAccountsService.list(userId, space.id),
      this.financeTransactionsService.monthlySummary(userId, space.id, month),
      this.prisma.financeTransaction.findMany({
        where: {
          spaceId: space.id,
          date: { gte: todayStart, lt: todayEnd },
          type: {
            in: [FinanceTransactionType.INCOME, FinanceTransactionType.EXPENSE],
          },
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
        const isDebt =
          a.type === FinanceAccountType.CREDIT_CARD && a.balance < 0;
        lines.push(
          `・${a.name}：${isDebt ? `欠款 ${fmt(-a.balance)}` : fmt(a.balance)}`,
        );
      }
    }

    lines.push(
      '',
      `今日：收入 ${fmt(todayIncome)} · 支出 ${fmt(todayExpense)}`,
    );
    lines.push(
      `本月：收入 ${fmt(monthSummary.totalIncome)} · 支出 ${fmt(monthSummary.totalExpense)}`,
    );

    const expenseCategories = monthSummary.byCategory
      .filter((c) => c.kind === FinanceTransactionType.EXPENSE)
      .sort((a, b) => b.total - a.total);
    if (expenseCategories.length > 0) {
      lines.push('', '本月支出分類佔比：');
      for (const c of expenseCategories) {
        const pct =
          monthSummary.totalExpense > 0
            ? Math.round((c.total / monthSummary.totalExpense) * 100)
            : 0;
        lines.push(`・${c.name} ${pct}%（${fmt(c.total)}）`);
      }
    }

    await this.reply(replyToken, lines.join('\n'));
  }

  // --- 股票投資 ---

  private async sendStockHelp(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.reply(
        replyToken,
        '找不到你的個人空間，請先到元序 App 登入一次。',
      );
      return;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    await this.reply(
      replyToken,
      [
        '📈 股票買賣',
        '買股0050 152 20 國泰世華',
        '（代碼／成交價／股數／帳戶，金額自動算）',
        '賣出用「賣股」開頭',
        '',
        `帳戶　${accounts.length ? accounts.map((a) => a.name).join('、') : '（還沒有，請到 App 新增）'}`,
        '',
        '交割日（T+2）自動記帳｜傳「持股總覽」看損益',
      ].join('\n'),
    );
  }

  private async sendStockHoldings(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.reply(
        replyToken,
        '找不到你的個人空間，請先到元序 App 登入一次。',
      );
      return;
    }
    const holdings = await this.stocksHoldingsService.list(userId, space.id);
    if (holdings.length === 0) {
      await this.reply(replyToken, '📊 持股總覽\n\n（目前沒有任何持股）');
      return;
    }
    const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
    const lines = ['📊 持股總覽', ''];
    for (const h of holdings) {
      const priceLabel =
        h.currentPrice != null ? fmt(h.currentPrice) : '（無報價）';
      const gainLossLabel =
        h.gainLoss != null
          ? `${h.gainLoss >= 0 ? '+' : ''}${fmt(h.gainLoss)}`
          : '（無報價）';
      lines.push(
        `・${h.stockName ?? h.stockCode}（${h.stockCode}）：${h.shares.toFixed(2)}股 · 均價 ${fmt(h.averageCost)} · 現價 ${priceLabel} · 損益 ${gainLossLabel}`,
      );
    }
    await this.reply(replyToken, lines.join('\n'));
  }

  /** Returns true once it's decided this text *was* a 股票買賣 command
   * attempt (even if parsing failed) — same "true means stop trying other
   * interpretations" contract as `tryFinanceCommand`. Writes go straight
   * through Prisma for the same LINE-trust-boundary reason 記帳 does. */
  private async tryStockCommand(
    userId: string,
    text: string,
    respond: Responder,
  ): Promise<boolean> {
    if (!text.startsWith('買股') && !text.startsWith('賣股')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const parsed = this.parseStockCommand(text, accounts);
    if (!parsed) {
      await respond('看不懂股票交易格式，傳「股票買賣」看範例跟目前可用的帳戶。');
      return true;
    }

    if (accounts.length === 0) {
      await respond('你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }
    if (!parsed.accountId) {
      await respond(
        `帳戶錯誤，請在指令裡包含正確的帳戶名稱：${accounts.map((a) => a.name).join('、')}`,
      );
      return true;
    }
    const accountId = parsed.accountId;

    const tradeDate = new Date();
    const totalCost = parsed.shares * parsed.pricePerShare;
    await this.prisma.stockTransaction.create({
      data: {
        spaceId: space.id,
        stockCode: parsed.stockCode,
        type: parsed.type,
        pricePerShare: parsed.pricePerShare,
        totalCost,
        shares: parsed.shares,
        tradeDate,
        settlementDate: computeSettlementDate(tradeDate),
        accountId,
      },
    });

    const account = accounts.find((a) => a.id === accountId);
    const typeLabel =
      parsed.type === StockTransactionType.BUY ? '買入' : '賣出';
    await respond(
      `已記錄${typeLabel} ${parsed.stockCode} ${parsed.shares} 股（成交價 ${parsed.pricePerShare}，金額 ${Math.round(totalCost).toLocaleString('en-US')}，帳戶 ${account?.name ?? ''}），交割日（T+2）到了會自動記帳。`,
    );
    return true;
  }

  /** "買股/賣股 代碼 成交價 股數 帳戶" — same lenient any/no-separator
   * parsing as `parseFinanceCommand`. 金額 is never typed, only derived
   * (pricePerShare * shares) — 2026-08-12：這之前是反過來（打投入成本、
   * 股數用算的），但券商的成交回報一向是告訴你成交價／股數，不是要你自己
   * 反推的總額，改成股數優先更貼近實際操作。Stock code is taken as a
   * leading 4-6 digit run (covers ordinary 4-digit tickers and 5-6 digit
   * ETF codes like 00929); 帳戶 is found the same substring-scan way
   * accounts are in 記帳, and is required the same way too (2026-08-06) —
   * `tryStockCommand` errors instead of defaulting when nothing matched. */
  private parseStockCommand(
    text: string,
    accounts: { id: string; name: string }[],
  ): {
    type: StockTransactionType;
    stockCode: string;
    pricePerShare: number;
    shares: number;
    accountId: string | null;
  } | null {
    let rest = text.trim();
    let type: StockTransactionType;
    if (rest.startsWith('買股')) {
      type = StockTransactionType.BUY;
      rest = rest.slice(2);
    } else if (rest.startsWith('賣股')) {
      type = StockTransactionType.SELL;
      rest = rest.slice(2);
    } else {
      return null;
    }
    rest = rest.replace(LEADING_SEPARATORS, '');

    const codeMatch = rest.match(/^\d{4,6}/);
    if (!codeMatch) return null;
    const stockCode = codeMatch[0];
    rest = rest.slice(codeMatch[0].length).replace(LEADING_SEPARATORS, '');

    const priceMatch = rest.match(/^\d+(\.\d+)?/);
    if (!priceMatch) return null;
    const pricePerShare = Number(priceMatch[0]);
    if (!(pricePerShare > 0)) return null;
    rest = rest.slice(priceMatch[0].length).replace(LEADING_SEPARATORS, '');

    const sharesMatch = rest.match(/^\d+(\.\d+)?/);
    if (!sharesMatch) return null;
    const shares = Number(sharesMatch[0]);
    if (!(shares > 0)) return null;
    rest = rest.slice(sharesMatch[0].length).replace(LEADING_SEPARATORS, '');

    let accountId: string | null = null;
    for (const a of [...accounts].sort(
      (x, y) => y.name.length - x.name.length,
    )) {
      const idx = rest.indexOf(a.name);
      if (idx !== -1) {
        accountId = a.id;
        break;
      }
    }

    return { type, stockCode, pricePerShare, shares, accountId };
  }

  /** A bare "代碼 成交價" with no keyword prefix (e.g. "0050 600") is only
   * ever a reply to a fired 定期定額 提醒 — matched against
   * `StockRecurringInvestment.awaitingReply` by
   * `StocksRecurringService.fulfillPendingReply`, never by position. 股數/
   * 金額不用打，計畫自己的 monthlyAmount 早就設定好了，回覆只需要成交價
   * 本身。The whole text must match exactly two groups (anchored), so this
   * never fires on unrelated messages that merely start with digits — and
   * specifically never collides with the old 3-number format some other
   * command might send, since that's a different length. */
  private async tryStockDcaReply(
    userId: string,
    text: string,
    replyToken: string,
  ): Promise<boolean> {
    const match = text.match(/^(\d{4,6})[\s\-+*/,，、]*(\d+(?:\.\d+)?)$/);
    if (!match) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.reply(
        replyToken,
        '找不到你的個人空間，請先到元序 App 登入一次。',
      );
      return true;
    }

    const stockCode = match[1];
    const pricePerShare = Number(match[2]);
    try {
      const result = await this.stocksRecurringService.fulfillPendingReply(
        space.id,
        stockCode,
        pricePerShare,
      );
      if (!result) {
        await this.reply(
          replyToken,
          `目前沒有「${stockCode}」在等待定期定額回覆，請確認代碼是否正確，或這筆是不是已經記過了。`,
        );
        return true;
      }
      await this.reply(
        replyToken,
        `已記錄定期定額：${stockCode} 成交價 ${pricePerShare}，買進 ${result.shares} 股（花費 ${Math.round(result.totalCost).toLocaleString('en-US')}），已立即從帳戶扣款。`,
      );
    } catch (error) {
      await this.reply(replyToken, error instanceof Error ? error.message : '定期定額登記失敗了，稍後再試一次。');
    }
    return true;
  }

  // --- 知識庫 ---

  private extractUrl(text: string): string | null {
    const match = text.match(/https?:\/\/\S+/);
    return match ? match[0] : null;
  }

  private async captureKnowledgeUrl(
    userId: string,
    url: string,
    replyToken: string,
  ) {
    if (isInstagramUrl(url) && !this.instagramFetcherService.configured) {
      await this.reply(replyToken, INSTAGRAM_UNSUPPORTED_MESSAGE);
      return;
    }

    const item = await this.knowledgeItemsService.createPending(userId, {
      sourceUrl: url,
      sourcePlatform: '', // overwritten once the fetcher actually determines it
    });
    await this.reply(replyToken, '收到，分析中，好了會再傳訊息通知你。');
    // Fire-and-forget — must not block the webhook's reply, and the actual
    // completion is reported back via a LINE push once done (see
    // KnowledgeAnalysisPipeline).
    void this.knowledgeAnalysisPipeline.processUrlSubmission(
      item.id,
      userId,
      url,
    );
  }

  /** 「分析 <文字>」——貼上的純文字不像網址/圖片/影片，需要明確的「分析」前綴
   * 才知道這是要收藏，不是打錯指令（2026-08-05 使用者明確選擇的設計）。跟
   * `captureKnowledgeUrl`同樣的建立-pending-再丟給pipeline流程，只是完全不
   * 需要`ContentFetcherService`——貼上的文字本身就是內容，不用另外抓取。 */
  private async captureKnowledgeText(
    userId: string,
    text: string,
    replyToken: string,
  ) {
    const content = text.replace(/^分析/, '').replace(LEADING_SEPARATORS, '').trim();
    if (!content) {
      await this.reply(replyToken, '請在「分析」後面接你想收藏的文字內容，例如「分析 <貼上的文章內容>」。');
      return;
    }

    const item = await this.knowledgeItemsService.createPending(userId, {
      sourcePlatform: '貼上文字',
    });
    await this.reply(replyToken, '收到，分析中，好了會再傳訊息通知你。');
    void this.knowledgeAnalysisPipeline.processTextSubmission(
      item.id,
      userId,
      content,
    );
  }

  /** LINE image messages carry no URL — the bytes have to be pulled from
   * LINE's separate content-hosting API using the message id. */
  private async handleImageMessage(link: LineAccountLink, messageId: string | undefined, replyToken: string) {
    if (!messageId) return;
    const linkId = link.id;
    const userId = link.userId;
    try {
      const data = await this.fetchLineMessageContent(messageId);
      // 拍收據記帳（2026-10-01）：是單據就交給萬用 AI 記帳，不進知識庫。
      const apiKey = (await this.usersService.findById(userId))?.claudeApiKey ?? null;
      let receipt: Awaited<ReturnType<ReceiptReaderService['read']>> = null;
      try {
        receipt = apiKey ? await this.receiptReader.read(userId, apiKey, data) : null;
      } catch (error) {
        if (!(error instanceof AiUnavailableError)) throw error;
        await this.reply(replyToken, aiUnavailableMessage(error));
        return;
      }
      if (apiKey && receipt) {
        const heading = `🧾 收據：${receipt.merchant ? `${receipt.merchant} ` : ''}${receipt.total.toLocaleString('en-US')} 元`;
        const handled = await this.replyPrefix.run(heading, () =>
          this.tryAiAgent(link, receiptToAgentText(receipt), replyToken, apiKey, true),
        );
        if (!handled) {
          await this.reply(
            replyToken,
            `${heading}\n\n${SYSTEM_TROUBLE_MESSAGE}\n先直接打「${receipt.items ?? receipt.merchant ?? '消費'} ${receipt.total}」也可以記帳。`,
          );
        }
        return;
      }
      const item = await this.knowledgeItemsService.createPending(userId, {
        sourcePlatform: '圖片',
      });
      await this.reply(replyToken, '收到，分析中，好了會再傳訊息通知你。');
      void this.knowledgeAnalysisPipeline.processImageSubmission(
        item.id,
        userId,
        {
          data,
          mimeType: 'image/jpeg',
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch LINE image content for link=${linkId}`,
        error as Error,
      );
      await this.reply(replyToken, '圖片下載失敗，請再傳一次看看。');
    }
  }

  /** Same idea as `handleImageMessage` — a screen recording/clip sent
   * straight to the bot (not a YouTube link, which is handled by
   * `captureKnowledgeUrl` instead since Gemini watches that by URI
   * reference). 2026-08-04: this message type was previously not handled
   * at all — `handleEvents`'s type filter silently dropped it, so a video
   * sent to the bot got no ack and no analysis, ever. */
  private async handleVideoMessage(
    linkId: string,
    userId: string,
    messageId: string | undefined,
    replyToken: string,
  ) {
    if (!messageId) return;
    try {
      const data = await this.fetchLineMessageContent(messageId);
      const item = await this.knowledgeItemsService.createPending(userId, {
        sourcePlatform: '影片',
      });
      await this.reply(replyToken, '收到，分析中，好了會再傳訊息通知你。');
      void this.knowledgeAnalysisPipeline.processVideoSubmission(
        item.id,
        userId,
        {
          data,
          mimeType: 'video/mp4',
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch LINE video content for link=${linkId}`,
        error as Error,
      );
      await this.reply(replyToken, '影片下載失敗，請再傳一次看看。');
    }
  }

  /** 語音訊息（2026-10-01）：Gemini 轉成文字後（2026-10-02 AI 改 Claude 後語音還是用 Gemini，Claude 聽不到聲音），跟打字完全走同一條路，
   * 回覆最上面加一行「🎤 我聽到：…」讓使用者確認有沒有聽錯。 */
  private async handleAudioMessage(link: LineAccountLink, messageId: string | undefined, replyToken: string) {
    if (!messageId) return;
    const apiKey = (await this.usersService.findById(link.userId))?.geminiApiKey ?? null;
    if (!apiKey) {
      await this.reply(replyToken, '語音要用 Gemini 轉成文字，請先到 App 左側「AI 設定」貼上 Gemini 金鑰（免費的就可以）；或直接打字給我。');
      return;
    }
    let audio: Buffer;
    try {
      audio = await this.fetchLineMessageContent(messageId);
    } catch (error) {
      this.logger.warn(`語音下載失敗 link=${link.id}: ${String(error)}`);
      await this.reply(replyToken, '語音下載失敗，請再傳一次看看。');
      return;
    }
    let text: string | null;
    try {
      text = await this.voice.transcribe(link.userId, apiKey, audio);
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) throw error;
      await this.reply(replyToken, `🎤 語音轉文字用的是 Gemini：${aiUnavailableMessage(error)}`);
      return;
    }
    if (!text) {
      await this.reply(replyToken, '🎤 我沒聽清楚，可以再說一次，或直接打字給我。');
      return;
    }
    await this.replyPrefix.run(`🎤 我聽到：「${text}」`, () => this.handleTextForLinkedUser(link, text, replyToken));
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
    ].join('\n');
  }

  private async fetchLineMessageContent(messageId: string): Promise<Buffer> {
    const response = await fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: { Authorization: `Bearer ${this.channelAccessToken}` },
      },
    );
    if (!response.ok) {
      throw new Error(`LINE content API returned ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async tryResolveKnowledgeCategoryDecision(
    link: LineAccountLink,
    text: string,
    replyToken: string,
  ) {
    const itemId = link.pendingKnowledgeItemId;
    if (!itemId) return;
    try {
      const categoryName =
        await this.knowledgeItemsService.resolveCategoryDecision(
          link.userId,
          itemId,
          text,
        );
      await this.prisma.lineAccountLink.update({
        where: { id: link.id },
        data: { pendingKnowledgeItemId: null },
      });
      await this.reply(replyToken, `已歸類到「${categoryName}」。`);
    } catch (error) {
      await this.reply(
        replyToken,
        error instanceof Error ? error.message : '設定失敗，請再試一次。',
      );
    }
  }

  /** 美食/景點 — after the rich-menu button set
   * `pendingKnowledgeLocationQueryCategory`, this reply's text is the
   * location to search for, matched against the "地址" field. */
  private async resolveKnowledgeLocationQuery(
    link: LineAccountLink,
    text: string,
    replyToken: string,
  ) {
    const categoryName = link.pendingKnowledgeLocationQueryCategory!;
    await this.prisma.lineAccountLink.update({
      where: { id: link.id },
      data: { pendingKnowledgeLocationQueryCategory: null },
    });

    const items = await this.knowledgeItemsService.searchByLocation(
      link.userId,
      categoryName,
      text.trim(),
    );
    if (items.length === 0) {
      await this.reply(
        replyToken,
        `附近沒有找到記錄過的${categoryName}（「${text.trim()}」）。`,
      );
      return;
    }
    const lines = [`📍 ${categoryName}搜尋結果（${text.trim()}）`, ''];
    for (const item of items) {
      const address = this.knowledgeItemsService.fieldTextValue(item, '地址');
      lines.push(
        `・${item.title ?? '未命名'}${address ? `（${address}）` : ''}`,
      );
    }
    await this.reply(replyToken, lines.join('\n'));
  }

  private async sendUpcomingExhibitions(userId: string, replyToken: string) {
    const items =
      await this.knowledgeItemsService.listUpcomingExhibitions(userId);
    if (items.length === 0) {
      await this.reply(replyToken, '📅 展覽\n\n（目前沒有記錄中的展覽）');
      return;
    }
    const lines = ['📅 展覽（依結束日期排序）', ''];
    for (const item of items) {
      const endDate = this.knowledgeItemsService.fieldDateValue(
        item,
        '結束日期',
      );
      const visited = this.knowledgeItemsService.fieldBooleanValue(
        item,
        '是否已觀展',
      );
      lines.push(
        `・${item.title ?? '未命名'}${endDate ? `（至 ${endDate.getMonth() + 1}/${endDate.getDate()}）` : ''}${visited ? '（已觀展）' : ''}`,
      );
    }
    await this.reply(replyToken, lines.join('\n'));
  }

  /** Two-phase conversation over the same pending slot
   * (`pendingExhibitionScheduleItemId`), disambiguated by the item's own
   * `exhibitionDecisionStatus`: still null means this reply is the initial
   * 安排/不安排 answer; already SCHEDULED means this reply is the follow-up
   * 何時 answer. Writes both a CalendarEvent (so it shows on the calendar)
   * and a personal ProjectTodo due the same day (so it also surfaces in the
   * daily 代辦事項 digest) — the todo is created via `personalOwnerUserId`,
   * same as any other 個人 todo. */
  private async resolveExhibitionSchedule(
    link: LineAccountLink,
    text: string,
    replyToken: string,
  ) {
    const itemId = link.pendingExhibitionScheduleItemId;
    if (!itemId) return;
    const item = await this.knowledgeItemsService.getByIdInternal(itemId);
    const trimmed = text.trim();

    if (item.exhibitionDecisionStatus === null) {
      if (trimmed === '安排') {
        await this.knowledgeItemsService.setExhibitionDecision(
          itemId,
          'SCHEDULED',
        );
        await this.reply(
          replyToken,
          '好的，請問要安排什麼時候？例如「8/10 14:00」或「明天」。',
        );
        return;
      }
      if (trimmed === '不安排') {
        await this.knowledgeItemsService.setExhibitionDecision(
          itemId,
          'CANCELLED',
        );
        await this.prisma.lineAccountLink.update({
          where: { id: link.id },
          data: { pendingExhibitionScheduleItemId: null },
        });
        await this.reply(replyToken, '好的，已取消觀展安排。');
        return;
      }
      await this.reply(replyToken, '請回覆「安排」或「不安排」。');
      return;
    }

    const scheduledAt = this.parseExhibitionDateTimeReply(trimmed);
    if (!scheduledAt) {
      await this.reply(
        replyToken,
        '看不懂時間，請用「8/10 14:00」這種格式，或直接打「明天」「今天」。',
      );
      return;
    }

    const space = await this.prisma.space.findUnique({
      where: { calendarOwnerUserId: link.userId },
    });
    if (!space) {
      await this.reply(
        replyToken,
        '你還沒有行事曆空間，請先到元序 App 建立一個，我先幫你記著這個安排。',
      );
      return;
    }
    await this.calendarEventsService.create(link.userId, space.id, {
      title: `${item.title ?? '展覽'}`,
      startAt: scheduledAt.toISOString(),
      allDay: false,
    });
    const maxSortOrder = await this.prisma.projectTodo.aggregate({
      where: { personalOwnerUserId: link.userId },
      _max: { sortOrder: true },
    });
    await this.prisma.projectTodo.create({
      data: {
        personalOwnerUserId: link.userId,
        title: `觀展：${item.title ?? '展覽'}`,
        dueDate: scheduledAt,
        isOngoing: false,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
    await this.knowledgeItemsService.setExhibitionDecision(
      itemId,
      'SCHEDULED',
      scheduledAt,
    );
    await this.prisma.lineAccountLink.update({
      where: { id: link.id },
      data: { pendingExhibitionScheduleItemId: null },
    });
    const dateLabel = `${scheduledAt.getMonth() + 1}/${scheduledAt.getDate()} ${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`;
    await this.reply(
      replyToken,
      `已安排「${item.title ?? '展覽'}」（${dateLabel}），加進你的行事曆和代辦事項了。`,
    );
  }

  /** "M/D HH:MM"／"M/D"（預設10:00）／"今天"／"明天" — a small standalone
   * parser distinct from `parseCalendarCommand` since there's no
   * "新增行事曆" prefix to strip here, just a bare date/time reply. */
  private parseExhibitionDateTimeReply(text: string): Date | null {
    const now = new Date();
    if (text === '今天')
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0);
    if (text === '明天') {
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      return new Date(
        tomorrow.getFullYear(),
        tomorrow.getMonth(),
        tomorrow.getDate(),
        10,
        0,
      );
    }

    const match = text.match(
      /^(\d{1,2})\/(\d{1,2})(?:[\s]+(\d{1,2}):(\d{2}))?/,
    );
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const hour = match[3] ? Number(match[3]) : 10;
    const minute = match[4] ? Number(match[4]) : 0;
    const date = new Date(now.getFullYear(), month - 1, day, hour, minute);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** "查詢 <問題>" — 2026-10-02 起交給萬用 AI（跟直接講話一樣），不再有獨立的
   * 查詢 AI。Requires the explicit "查詢" prefix (not a no-match fallback) — the
   * user's own choice, to avoid an ordinary unrecognized command silently
   * turning into an AI call. */
  private async handleAiQuery(link: LineAccountLink, text: string, replyToken: string): Promise<void> {
    const question = text.replace(/^查詢/, '').replace(LEADING_SEPARATORS, '').trim();
    if (!question) {
      await this.reply(replyToken, '請在「查詢」後面接你想問的問題，例如「查詢 這個月餐飲花多少」。');
      return;
    }

    const apiKey = (await this.usersService.findById(link.userId))?.claudeApiKey ?? null;
    if (!apiKey) {
      await this.reply(replyToken, needClaudeKey('查詢'));
      return;
    }
    if (!(await this.tryAiAgent(link, question, replyToken, apiKey, true))) {
      await this.reply(replyToken, `這次查詢失敗了。${SYSTEM_TROUBLE_MESSAGE}`);
    }
  }

  // --- 代辦事項（個人）---

  /** `（8/10）`／`（持續）`／`''` (for a pre-existing row with neither set —
   * see schema comment on ProjectTodo). */
  private todoDateSuffix(todo: { dueDate: Date | null; isOngoing: boolean }): string {
    if (todo.isOngoing) return '（持續）';
    if (todo.dueDate) return `（${todo.dueDate.getMonth() + 1}/${todo.dueDate.getDate()}）`;
    return '';
  }

  /** Format reminder + the caller's incomplete personal todos, numbered —
   * those numbers are what "完成 N" resolves against next. */
  private async sendTodoHelp(linkId: string, userId: string, replyToken: string) {
    const incomplete = await this.prisma.projectTodo.findMany({
      where: { personalOwnerUserId: userId, done: false },
      orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    });
    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { lastTodoListIds: incomplete.map((t) => t.id) },
    });

    const lines = [
      '✅ 代辦事項',
      '新增8/10買材料｜完成2｜改期2 8/15',
      '',
      `未完成清單（${incomplete.length}）：`,
    ];
    lines.push(
      ...(incomplete.length
        ? incomplete.map((t, i) => `${i + 1}. ${t.title}${this.todoDateSuffix(t)}`)
        : ['（目前沒有未完成的代辦事項）']),
    );
    lines.push('', '傳「代辦事項總覽」看今天的狀況。');
    await this.reply(replyToken, lines.join('\n'));
  }

  /** 今日已完成、今日到期還沒完成、未來 7 天內到期、持續性任務（不受日期
   * 限制，永遠列出）—— 未完成的三組會連續編號，供「完成 N」使用；已完成的
   * 只是列出來看，沒有編號（沒有可以「完成」的動作）。 */
  private async sendTodoOverviewAllProjects(
    linkId: string,
    userId: string,
    replyToken: string,
  ) {
    // Bounded to what the four buckets below can actually use (still-open,
    // or completed today) — this used to fetch the caller's entire todo
    // history unconditionally and filter in memory, the same unbounded-list
    // problem as TodosService.listAll (see 大系統V1.44.0).
    const { start: todayStart, end: todayEnd } = taipeiTodayRange();
    const todos = await this.prisma.projectTodo.findMany({
      where: {
        personalOwnerUserId: userId,
        OR: [{ done: false }, { done: true, completedAt: { gte: todayStart } }],
      },
      orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    });
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
    const isSameDay = (d: Date) => d >= todayStart && d < todayEnd;

    const completedToday = todos.filter(
      (t) => t.completedAt && isSameDay(t.completedAt),
    );
    // 已逾期（到期日早於今天、還沒完成）——跟下面的「今日到期」是分開的兩
    // 種急迫程度，之前這個查詢雖然有抓到（done: false 沒有下限），但完全
    // 沒有被放進任何一個顯示區塊，等於憑空消失，使用者看不到。
    const overdue = todos.filter((t) => !t.done && t.dueDate && t.dueDate < todayStart);
    const dueToday = todos.filter(
      (t) => !t.done && t.dueDate && isSameDay(t.dueDate),
    );
    const restOfWeek = todos.filter(
      (t) =>
        !t.done && t.dueDate && t.dueDate >= todayEnd && t.dueDate < weekEnd,
    );
    const ongoing = todos.filter((t) => !t.done && t.isOngoing);

    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: {
        lastTodoListIds: [...overdue, ...dueToday, ...restOfWeek, ...ongoing].map((t) => t.id),
      },
    });

    const labelOf = (t: (typeof todos)[number]) => t.title;

    const lines: string[] = ['✅ 代辦事項總覽', ''];

    lines.push(`今日已完成（${completedToday.length}）：`);
    lines.push(
      ...(completedToday.length
        ? completedToday.map((t) => `・${labelOf(t)}`)
        : ['（沒有）']),
    );

    lines.push('', `⚠️ 已逾期未完成（${overdue.length}）：`);
    lines.push(
      ...(overdue.length
        ? overdue.map((t, i) => `${i + 1}. ${labelOf(t)}（${t.dueDate!.getMonth() + 1}/${t.dueDate!.getDate()}）`)
        : ['（沒有）']),
    );

    lines.push('', `今日到期但還沒完成（${dueToday.length}）：`);
    lines.push(
      ...(dueToday.length
        ? dueToday.map((t, i) => `${overdue.length + i + 1}. ${labelOf(t)}`)
        : ['（沒有）']),
    );

    lines.push('', `未來 7 天內到期（${restOfWeek.length}）：`);
    lines.push(
      ...(restOfWeek.length
        ? restOfWeek.map(
            (t, i) =>
              `${overdue.length + dueToday.length + i + 1}. ${labelOf(t)}（${t.dueDate!.getMonth() + 1}/${t.dueDate!.getDate()}）`,
          )
        : ['（沒有）']),
    );

    lines.push('', `持續性任務（${ongoing.length}）：`);
    lines.push(
      ...(ongoing.length
        ? ongoing.map(
            (t, i) => `${overdue.length + dueToday.length + restOfWeek.length + i + 1}. ${labelOf(t)}`,
          )
        : ['（沒有）']),
    );

    lines.push('', '傳「完成 編號」標記完成，或「改期 編號 新日期」改期，例如「完成 2」「改期 2 8/15」。');
    await this.reply(replyToken, lines.join('\n'));
  }

  /** Shared by `parseTodoCommand` (新增) and `rescheduleTodoByNumber`
   * (改期) — pulls a leading date (自我分隔, same digit+"/" style as
   * `parseCalendarCommand`) or the `持續` keyword off the front of `text`,
   * returning the parsed date/ongoing flag plus whatever's left. Returns
   * null if neither is found at the front. */
  private parseDateOrOngoingPrefix(
    text: string,
  ): { dueDate: Date | null; dueDateAllDay: boolean; isOngoing: boolean; rest: string } | null {
    if (text.startsWith('持續')) {
      return {
        dueDate: null,
        dueDateAllDay: true,
        isOngoing: true,
        rest: text.slice(2).replace(LEADING_SEPARATORS, ''),
      };
    }
    const dateMatch = text.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,2}))?/);
    if (!dateMatch) return null;
    const year = dateMatch[3] ? Number(dateMatch[1]) : new Date().getFullYear();
    const month = Number(dateMatch[3] ? dateMatch[2] : dateMatch[1]);
    const day = Number(dateMatch[3] ?? dateMatch[2]);
    let rest = text.slice(dateMatch[0].length).replace(LEADING_SEPARATORS, '');

    // 可選的時間（跟「新增行事曆」同樣的 HH:MM 格式，2026-08-05 新增，讓代
    // 辦事項也能跟行事曆一樣帶時間）——沒有就整天，維持原本的行為。
    const timeMatch = rest.match(/^(\d{1,2}):(\d{2})/);
    let dueDate: Date;
    let dueDateAllDay: boolean;
    if (timeMatch) {
      const hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2]);
      dueDate = taipeiWallClockToUtc(year, month - 1, day, hour, minute);
      dueDateAllDay = false;
      rest = rest.slice(timeMatch[0].length).replace(LEADING_SEPARATORS, '');
    } else {
      dueDate = new Date(year, month - 1, day);
      dueDateAllDay = true;
    }
    if (Number.isNaN(dueDate.getTime())) return null;
    return { dueDate, dueDateAllDay, isOngoing: false, rest };
  }

  /** 每一筆代辦事項都必須是「有日期」或「持續性任務」二選一（2026-08-03 使
   * 用者明確要求），所以「新增」指令的日期/「持續」標記是必填，不是可省
   * 略的欄位 —— 沒偵測到任一種就直接請使用者補上，不會靜靜地新增一筆兩者
   * 都沒有的項目。 */
  private parseTodoCommand(
    text: string,
  ):
    | { title: string; dueDate: Date | null; dueDateAllDay: boolean; isOngoing: boolean }
    | null
    | 'needs_date' {
    const rest = text.replace(/^新增(代辦|待辦)?/, '').replace(LEADING_SEPARATORS, '');
    const parsed = this.parseDateOrOngoingPrefix(rest);
    if (!parsed) return 'needs_date';

    const title = parsed.rest.replace(EDGE_SEPARATORS, '').trim();
    if (!title) return null;

    return { title, dueDate: parsed.dueDate, dueDateAllDay: parsed.dueDateAllDay, isOngoing: parsed.isOngoing };
  }

  private async createTodoFromText(
    link: LineAccountLink,
    text: string,
    respond: Responder,
  ) {
    const parsed = this.parseTodoCommand(text);
    if (parsed === 'needs_date') {
      await respond(
        '請加上日期或標記「持續」，例如「新增 8/10 買材料」、「新增 8/10 14:00 買材料」或「新增 持續 每週檢查庫存」。',
      );
      return;
    }
    if (!parsed) {
      await respond('請在「新增」後面接代辦事項的內容，例如「新增 8/10 買材料」。');
      return;
    }
    const { title, dueDate, dueDateAllDay, isOngoing } = parsed;
    const dateLabel = isOngoing ? '持續' : formatTaipeiDateTime(dueDate!, dueDateAllDay);

    // 透過 TodosService 而不是直接寫 Prisma——這樣才會一併觸發代辦事項→
    // 行事曆的同步（2026-08-05），不用在這裡重複寫一次同步邏輯。
    await this.todosService.create(link.userId, {
      title,
      dueDate: dueDate?.toISOString(),
      dueDateAllDay,
      isOngoing,
    });
    await respond(`已新增代辦事項「${title}」（${dateLabel}）。`);
  }

  /** "完成 N" references the Nth item of whichever list (代辦事項 or
   * 代辦事項總覽) was shown to this LINE user most recently — see
   * `LineAccountLink.lastTodoListIds`. Numbers don't shift after a
   * completion within the same shown list; completing the same number
   * twice just reports it's already done. */
  private async completeTodoByNumber(
    linkId: string,
    text: string,
    replyToken: string,
  ) {
    const match = text.match(/\d+/);
    if (!match) {
      await this.reply(
        replyToken,
        '請在「完成」後面接編號，例如「完成 2」，編號請先看「代辦事項」或「代辦事項總覽」。',
      );
      return;
    }
    const n = Number(match[0]);
    const link = await this.prisma.lineAccountLink.findUnique({
      where: { id: linkId },
    });
    const todoId = link?.lastTodoListIds[n - 1];
    if (!todoId) {
      await this.reply(
        replyToken,
        `找不到編號 ${n}，請先傳「代辦事項」或「代辦事項總覽」看目前的編號。`,
      );
      return;
    }
    const todo = await this.prisma.projectTodo.findUnique({
      where: { id: todoId },
    });
    if (!todo) {
      await this.reply(replyToken, '這筆代辦事項好像已經被刪除了。');
      return;
    }
    if (todo.done) {
      await this.reply(replyToken, `「${todo.title}」已經是完成狀態了。`);
      return;
    }
    await this.prisma.projectTodo.update({
      where: { id: todo.id },
      data: { done: true, completedAt: new Date() },
    });
    await this.reply(replyToken, `已完成「${todo.title}」。`);
  }

  /** "改期 N 日期或「持續」" — same numbered-list reference as「完成 N」,
   * lets a todo be rescheduled (or switched to/from 持續性任務) without
   * having to delete and recreate it. */
  private async rescheduleTodoByNumber(
    linkId: string,
    text: string,
    replyToken: string,
  ) {
    const rest = text.replace(/^改期/, '').replace(LEADING_SEPARATORS, '');
    const numberMatch = rest.match(/^\d+/);
    if (!numberMatch) {
      await this.reply(
        replyToken,
        '請在「改期」後面接編號跟新日期（或「持續」），例如「改期 2 8/15」或「改期 2 持續」，編號請先看「代辦事項」或「代辦事項總覽」。',
      );
      return;
    }
    const n = Number(numberMatch[0]);
    const afterNumber = rest.slice(numberMatch[0].length).replace(LEADING_SEPARATORS, '');

    const parsed = this.parseDateOrOngoingPrefix(afterNumber);
    if (!parsed) {
      await this.reply(
        replyToken,
        '請在編號後面接新日期或「持續」，例如「改期 2 8/15」或「改期 2 持續」。',
      );
      return;
    }

    const link = await this.prisma.lineAccountLink.findUnique({
      where: { id: linkId },
    });
    const todoId = link?.lastTodoListIds[n - 1];
    if (!todoId) {
      await this.reply(
        replyToken,
        `找不到編號 ${n}，請先傳「代辦事項」或「代辦事項總覽」看目前的編號。`,
      );
      return;
    }
    const todo = await this.prisma.projectTodo.findUnique({
      where: { id: todoId },
    });
    if (!todo) {
      await this.reply(replyToken, '這筆代辦事項好像已經被刪除了。');
      return;
    }
    // 透過 TodosService 而不是直接寫 Prisma，理由跟「新增」一樣——一併觸發
    // 代辦事項→行事曆同步。
    await this.todosService.update(link!.userId, todo.id, {
      dueDate: parsed.dueDate?.toISOString() ?? null,
      dueDateAllDay: parsed.dueDateAllDay,
      isOngoing: parsed.isOngoing,
    });
    const dateLabel = parsed.isOngoing ? '持續' : formatTaipeiDateTime(parsed.dueDate!, parsed.dueDateAllDay);
    await this.reply(replyToken, `已將「${todo.title}」改期為 ${dateLabel}。`);
  }

  // --- 人生目標 ---

  /** 唯讀 — 新增/更新進度目前只在 App 端做（數字型目標的「目前值」用打字
   * 輸入不太自然），LINE 這裡先只做「隨時看得到進度」這件事。 */
  private async sendLifeGoals(userId: string, replyToken: string) {
    const goals = await this.lifeGoalsService.listAll(userId, LifeGoalStatus.ACTIVE);
    if (goals.length === 0) {
      await this.reply(
        replyToken,
        '🎯 人生目標\n\n目前沒有進行中的目標。可以直接跟我說，例如「新增目標 年底前存到15萬」。',
      );
      return;
    }

    const lines = ['🎯 人生目標', ''];
    for (const g of goals) {
      const dateLabel = g.targetDate ? `（期限 ${g.targetDate.getUTCMonth() + 1}/${g.targetDate.getUTCDate()}）` : '';
      const progress = formatGoalProgress(g);
      lines.push(progress ? `・${g.title}${dateLabel}\n　${progress}` : `・${g.title}${dateLabel}`);
    }
    lines.push('', '直接跟我說進度就會記錄，例如「體重現在72」「今天運動了」');
    await this.reply(replyToken, lines.join('\n'));
  }

  /** Returns false (without replying) when the AI says the message isn't
   * something it can act on, or fails — the caller falls through. */
  private async tryAiAgent(link: LineAccountLink, text: string, replyToken: string, apiKey: string, forceAgent = false): Promise<boolean> {
    try {
      const result = await this.aiAgent.handleLine({ link, apiKey, text, forceAgent });
      if (!result.handled) return false;
      await this.reply(replyToken, result.reply);
      return true;
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        await this.reply(replyToken, aiUnavailableMessage(error));
        return true;
      }
      // AiAgentService 已經 logger.error（→ 通知管理員）；記下來，固定指令也
      // 接不住時回「已通知管理員」而不是「看不懂」。
      const state = this.eventState.getStore();
      if (state) state.aiFailed = true;
      return false;
    }
  }



  // --- 行事曆 ---

  /** "新增行事曆 日期 時間 項目 [@地點]" — date is M/D or YYYY/M/D, time is
   * H:MM or 全天 for an all-day event, an optional "@地點" token sets
   * location. Fields may be separated by whitespace/punctuation or nothing
   * at all — date and time are self-delimiting (digits+"/", digits+":"),
   * so they can still be pulled out of glued-together text; @地點 is
   * self-delimiting too. Always the caller's own 1:1 calendar space —
   * unlike 專案代辦事項 there's no multi-space ambiguity to resolve here. */
  private async createCalendarEventFromText(
    userId: string,
    text: string,
    respond: Responder,
  ) {
    const parsed = this.parseCalendarCommand(text);
    if (!parsed) {
      await respond(
        '看不懂格式，請用「新增行事曆 日期 時間 項目 [@地點]」，例如「新增行事曆 7/31 14:00 開會 @台北辦公室」；全天活動時間可以打「全天」。',
      );
      return;
    }

    const space = await this.prisma.space.findUnique({
      where: { calendarOwnerUserId: userId },
    });
    if (!space) {
      await respond('你還沒有行事曆空間，請先到元序 App 建立一個。');
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
    await respond(`已新增行事曆「${parsed.title}」（${dateLabel} ${timeLabel}）。`);
  }

  /** "今日行事曆" — was a real gap: 行事曆 only ever had "新增", no way to
   * just look at what's already on it. Uses `taipeiTodayRange` (not a naive
   * `new Date()` day boundary) for the same reason `HomeService.todayRange`
   * does — Render's server clock is UTC, not Taiwan time. */
  private async sendTodayCalendarEvents(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { calendarOwnerUserId: userId },
    });
    if (!space) {
      await this.reply(replyToken, '你還沒有行事曆空間，請先到元序 App 建立一個。');
      return;
    }

    const { start, end } = taipeiTodayRange();
    const events = await this.prisma.calendarEvent.findMany({
      where: { spaceId: space.id, startAt: { gte: start, lt: end } },
      orderBy: { startAt: 'asc' },
    });

    if (events.length === 0) {
      await this.reply(replyToken, '📅 今日行事曆\n\n今天沒有排定的行程。');
      return;
    }

    const lines = ['📅 今日行事曆', ''];
    for (const event of events) {
      const timeLabel = event.allDay
        ? '全天'
        : `${String(event.startAt.getHours()).padStart(2, '0')}:${String(event.startAt.getMinutes()).padStart(2, '0')}`;
      lines.push(`・${timeLabel} ${event.title}${event.location ? `（${event.location}）` : ''}`);
    }
    await this.reply(replyToken, lines.join('\n'));
  }

  private parseCalendarCommand(text: string): {
    startAt: Date;
    allDay: boolean;
    title: string;
    location: string | null;
  } | null {
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

    const startAt = allDay
      ? new Date(year, month - 1, day)
      : new Date(year, month - 1, day, hour, minute);
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
    const prefix = this.replyPrefix.getStore();
    if (prefix) text = `${prefix}\n\n${text}`;
    await this.callReplyApi({ replyToken, messages: [{ type: 'text', text }] });
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
