import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { AI_QUERY_TOOLS, AiQueryToolsService } from '../ai-assistant/ai-query-tools.service';
import { LIFE_GOAL_TOOLS, LifeGoalAiService } from '../life-goals/life-goal-ai.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { TodosService } from '../todos/todos.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { KNOWLEDGE_AI_GUIDE, KNOWLEDGE_TOOLS, KnowledgeAiService } from '../knowledge/knowledge-ai.service';
import { STOCK_AI_GUIDE, STOCK_TOOLS, StockAiService } from '../stocks/stock-ai.service';
import { taipeiDateKey, taipeiWallClockToUtc } from '../common/taipei-date';
import {
  AiUsageStatus,
  CalendarSyncTarget,
  FinanceCategoryKind,
  FinanceTransactionType,
  Prisma,
} from '../../generated/prisma/client.js';
import type { LineAccountLink } from '../../generated/prisma/client.js';
import { LifeReviewService } from '../life-review/life-review.service';
import { JOURNAL_AI_GUIDE, JOURNAL_TOOLS, JournalAiService } from '../journal/journal-ai.service';
import { FinanceHealthService } from '../finance/finance-health.service';
import { FinancePlanService } from '../finance/finance-plan.service';
import { DIVINATION_AI_GUIDE, DIVINATION_TOOLS, DivinationAiService } from '../divination/divination-ai.service';
import { HEALTH_AI_GUIDE, HEALTH_TOOLS, HealthAiService } from '../health/health-ai.service';
import { JOURNAL_PROMPT_WINDOW_MS } from '../journal/journal-reminder.service';
import { RECORD_AI_GUIDE, RECORD_TOOLS, RecordPending, RecordToolsService } from './record-tools.service';
import { findFreeSlots, parseClock, ScheduleKind } from './free-slots';

const MAX_TOOL_ROUNDS = 6;
export const CONVERSATION_WINDOW_MS = 10 * 60 * 1000;
/** What the model answers when a message is nothing it can act on. */
const NOT_HANDLED = 'NOT_HANDLED';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ToolArgs = Record<string, unknown>;

/** An action the AI proposed that only runs once the user replies to confirm. */
type PendingAction =
  | { kind: 'transaction'; summary: string; data: TransactionData }
  | { kind: 'calendar_event'; summary: string; data: CalendarEventData }
  | { kind: 'budgets'; summary: string; data: Array<{ categoryName: string; monthlyAmount: number }> }
  | RecordPending;

interface TransactionData {
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  accountId: string;
  categoryId: string;
  date: string;
  note: string | null;
}

interface CalendarEventData {
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  syncTarget: CalendarSyncTarget | null;
}

const TARGET_LABEL: Record<CalendarSyncTarget, string> = { GOOGLE: 'Google', ICLOUD: 'iPhone（iCloud）' };

const AGENT_TOOLS = [
  {
    type: 'function' as const,
    name: 'get_financial_plan_inputs',
    description:
      '理財評估要用的數據：固定月收入（薪資）與固定支出、近 3 個月平均收入/支出、各分類月平均花費與目前預算、可設預算的分類、財務健檢、淨資產。做理財評估、推薦預算、問「薪水怎麼分配」時先呼叫。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'set_fixed_income',
    description: '設定固定薪資（每月自動記一筆收入）。沒講發薪日就先問。accountName 是薪水入帳的帳戶，沒講就用銀行帳戶。',
    parameters: {
      type: 'object',
      properties: { amount: { type: 'number' }, dayOfMonth: { type: 'integer', minimum: 1, maximum: 31 }, accountName: { type: 'string' } },
      required: ['amount', 'dayOfMonth'],
    },
  },
  {
    type: 'function' as const,
    name: 'propose_budgets',
    description: '把你推薦的每月預算幫他設好（分類名稱要用 budgetableCategories 裡的）。回傳 needsConfirmation，他同意才會設。',
    parameters: {
      type: 'object',
      properties: {
        budgets: {
          type: 'array',
          items: { type: 'object', properties: { categoryName: { type: 'string' }, monthlyAmount: { type: 'number' } }, required: ['categoryName', 'monthlyAmount'] },
        },
      },
      required: ['budgets'],
    },
  },
  {
    type: 'function' as const,
    name: 'get_financial_health',
    description:
      '財務健檢：0～100 分與六項細分（儲蓄率、緊急預備金、負債比、預算控管、投資配置、記帳習慣），每項有現況跟改善建議，另附月平均收入/支出與淨資產。做財務規劃、問「我的財務狀況怎樣」時先呼叫。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'get_life_review',
    description: '產生這週或這個月到目前為止的回顧（錢、代辦、目標、股票，含跟上期比較），回傳整理好的文字。使用者說「這週過得怎樣」「月回顧」時用。',
    parameters: { type: 'object', properties: { period: { type: 'string', enum: ['week', 'month'] } }, required: ['period'] },
  },
  {
    type: 'function' as const,
    name: 'record_transaction',
    description:
      '記一筆收入或支出。categoryName 從系統提示列出的分類裡挑意思最接近的一個（必填）。使用者有講帳戶才填 accountName；沒講就不要填，系統會猜最常用的帳戶並回傳 needsConfirmation，這時要問使用者「記在 X 可以嗎？」，等他回覆再 confirm_pending_action。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['EXPENSE', 'INCOME'] },
        amount: { type: 'number' },
        categoryName: { type: 'string' },
        accountName: { type: 'string' },
        note: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD，不填＝今天' },
      },
      required: ['type', 'amount', 'categoryName'],
    },
  },
  {
    type: 'function' as const,
    name: 'create_todo',
    description:
      '新增代辦事項。有日期就填 dueDate（有時間再填 dueTime）；沒有日期就設 isOngoing=true（持續性任務）。有日期而且使用者有連結行事曆時，calendarTarget 必填（GOOGLE 或 ICLOUD），使用者沒講就先問他「要存到 Google 還是 iPhone？」。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        dueTime: { type: 'string', description: 'HH:mm（台北時間）' },
        isOngoing: { type: 'boolean' },
        notes: { type: 'string' },
        calendarTarget: { type: 'string', enum: ['GOOGLE', 'ICLOUD'] },
      },
      required: ['title'],
    },
  },
  {
    type: 'function' as const,
    name: 'complete_todo',
    description: '把代辦事項標記完成。todoId 從 list_todos 取得。',
    parameters: { type: 'object', properties: { todoId: { type: 'string' } }, required: ['todoId'] },
  },
  {
    type: 'function' as const,
    name: 'create_calendar_event',
    description:
      '使用者有講明確時間時，直接新增行程。target 必填（GOOGLE 或 ICLOUD，只能用系統提示列出已連結的），使用者沒講就先問「要存到 Google 還是 iPhone？」。沒有 startTime 代表全天。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        startTime: { type: 'string', description: 'HH:mm（台北時間），全天就不填' },
        endTime: { type: 'string', description: 'HH:mm' },
        endDate: { type: 'string', description: '跨天的全天行程最後一天 YYYY-MM-DD' },
        location: { type: 'string' },
        notes: { type: 'string' },
        target: { type: 'string', enum: ['GOOGLE', 'ICLOUD'] },
      },
      required: ['title', 'date'],
    },
  },
  {
    type: 'function' as const,
    name: 'find_free_slots',
    description:
      '使用者只說要做什麼、沒講時間（「幫我排 2 小時整理報表」）時，找行事曆的空檔。kind：工作的事 WORK（平日 8:00–18:00）、私人的事 PERSONAL（平日 19:00–23:00、假日 10:00–22:00）。使用者有指定時段（「早上」「晚上八點後」）就用 windowStart/windowEnd 覆蓋。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['WORK', 'PERSONAL'] },
        durationMinutes: { type: 'integer' },
        earliestDate: { type: 'string', description: 'YYYY-MM-DD，不填＝現在起' },
        latestDate: { type: 'string', description: 'YYYY-MM-DD，不填＝7 天內' },
        windowStart: { type: 'string', description: 'HH:mm' },
        windowEnd: { type: 'string', description: 'HH:mm' },
      },
      required: ['kind', 'durationMinutes'],
    },
  },
  {
    type: 'function' as const,
    name: 'propose_calendar_event',
    description:
      '把 find_free_slots 找到的時段提議給使用者，先存成「等確認」，不會馬上新增。參數同 create_calendar_event（startTime/endTime 必填，target 同樣必填）。之後要問使用者「這個時間可以嗎？」，他同意才 confirm_pending_action。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string' },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        location: { type: 'string' },
        notes: { type: 'string' },
        target: { type: 'string', enum: ['GOOGLE', 'ICLOUD'] },
      },
      required: ['title', 'date', 'startTime', 'endTime'],
    },
  },
  {
    type: 'function' as const,
    name: 'confirm_pending_action',
    description: '使用者在「新的一則訊息」裡同意了等確認的動作（「好」「可以」「對」）才呼叫，執行它。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'cancel_pending_action',
    description: '使用者不要等確認的那個動作時呼叫。',
    parameters: { type: 'object', properties: {} },
  },
];

const ALL_TOOLS = [...AI_QUERY_TOOLS, ...LIFE_GOAL_TOOLS, ...KNOWLEDGE_TOOLS, ...STOCK_TOOLS, ...JOURNAL_TOOLS, ...RECORD_TOOLS, ...DIVINATION_TOOLS, ...HEALTH_TOOLS, ...AGENT_TOOLS];
const QUERY_TOOL_NAMES = new Set(AI_QUERY_TOOLS.map((t) => t.name));

/** Where the conversation happens — decides where its state is stored
 * (LineAccountLink vs AppAiSession), how long a conversation stays live,
 * and small reply-style differences. */
export type AgentChannel = { kind: 'line'; linkId: string } | { kind: 'app' };

/** Same four columns on LineAccountLink and AppAiSession. */
export type AgentState = Pick<
  LineAccountLink,
  'aiInteractionId' | 'aiInteractionAt' | 'pendingAiAction' | 'pendingAiActionTurn'
>;

const APP_CONVERSATION_WINDOW_MS = 60 * 60 * 1000;

interface AgentContext {
  userId: string;
  channel: AgentChannel;
  /** LINE 剛在 21:30 問過「今天過得怎樣？」 */
  journalPrompted: boolean;
  turnId: string;
  personalSpaceId: string | null;
  calendarSpaceId: string | null;
  connectedTargets: CalendarSyncTarget[];
  pending: { action: PendingAction; turnId: string | null } | null;
}

export interface AgentResult {
  handled: boolean;
  reply: string;
  interactionId: string;
}

/** 萬用 AI (2026-09-30 LINE，2026-10-01 App 的 AI 問答也共用): 記帳、代辦、
 * 行事曆（含自動找空檔）、人生目標、知識庫、股票、生活規劃與閒聊、
 * 查詢 — everything by just talking. Every write goes through the same
 * service the App uses. Guessed values (記帳帳戶) and auto-picked times are
 * never written straight away: they become a `pendingAiAction` that only
 * runs when a LATER message confirms it (enforced here, not left to the
 * model). 股票只讀：看持股損益、分析走勢（2026-10-01 使用者要求），不記交易。 */
@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AiUsageService,
    private readonly queryTools: AiQueryToolsService,
    private readonly goalTools: LifeGoalAiService,
    private readonly transactions: FinanceTransactionsService,
    private readonly todos: TodosService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly knowledgeTools: KnowledgeAiService,
    private readonly stockTools: StockAiService,
    private readonly lifeReview: LifeReviewService,
    private readonly journalTools: JournalAiService,
    private readonly financeHealth: FinanceHealthService,
    private readonly recordTools: RecordToolsService,
    private readonly divinationTools: DivinationAiService,
    private readonly financePlan: FinancePlanService,
    private readonly healthTools: HealthAiService,
  ) {}

  static isConversationActive(
    state: Pick<AgentState, 'aiInteractionId' | 'aiInteractionAt'>,
    windowMs = CONVERSATION_WINDOW_MS,
  ): boolean {
    return (
      state.aiInteractionId != null &&
      state.aiInteractionAt != null &&
      Date.now() - state.aiInteractionAt.getTime() < windowMs
    );
  }

  static isJournalPromptActive(link: Pick<LineAccountLink, 'journalPromptAt'>): boolean {
    return link.journalPromptAt != null && Date.now() - link.journalPromptAt.getTime() < JOURNAL_PROMPT_WINDOW_MS;
  }

  /** App 的 AI 問答：畫面上每段對話會送回上一輪的 interactionId；沒送（開新
   * 對話）或跟伺服器記的不一樣，就從頭開始，等確認的動作也一起作廢。 */
  async handleApp(params: { userId: string; apiKey: string; text: string; previousInteractionId?: string }): Promise<AgentResult> {
    const session = await this.prisma.appAiSession.findUnique({ where: { userId: params.userId } });
    const continuing =
      session != null &&
      params.previousInteractionId != null &&
      session.aiInteractionId === params.previousInteractionId &&
      AiAgentService.isConversationActive(session, APP_CONVERSATION_WINDOW_MS);
    return this.handle({
      userId: params.userId,
      apiKey: params.apiKey,
      text: params.text,
      channel: { kind: 'app' },
      state: continuing ? session : null,
    });
  }

  handleLine(params: { link: LineAccountLink; apiKey: string; text: string }): Promise<AgentResult> {
    const { link } = params;
    return this.handle({
      userId: link.userId,
      apiKey: params.apiKey,
      text: params.text,
      channel: { kind: 'line', linkId: link.id },
      state: AiAgentService.isConversationActive(link) ? link : null,
      journalPrompted: AiAgentService.isJournalPromptActive(link),
    });
  }

  /** `state` is null when this message starts a new conversation. */
  private async handle(params: {
    userId: string;
    apiKey: string;
    text: string;
    channel: AgentChannel;
    state: AgentState | null;
    journalPrompted?: boolean;
  }): Promise<AgentResult> {
    const { state, channel } = params;
    const active = state != null;
    const ctx = await this.buildContext(params.userId, channel, state);
    ctx.journalPrompted = params.journalPrompted ?? false;
    const client = new GoogleGenAI({ apiKey: params.apiKey });
    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let status: AiUsageStatus = AiUsageStatus.SUCCESS;
    let errorMessage: string | undefined;

    try {
      let interaction = await client.interactions.create({
        model: GEMINI_MODEL,
        system_instruction: await this.systemInstruction(ctx),
        tools: ALL_TOOLS,
        ...(active && { previous_interaction_id: state.aiInteractionId! }),
        input: params.text,
      });
      inputTokens += interaction.usage?.total_input_tokens ?? 0;
      outputTokens += interaction.usage?.total_output_tokens ?? 0;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const calls = (interaction.steps ?? []).filter(
          (step): step is typeof step & { type: 'function_call' } => step.type === 'function_call',
        );
        if (calls.length === 0) break;

        // Sequential, not Promise.all: tools share `ctx.pending` and a
        // confirm right after a propose must see the propose's write.
        const results: Array<{
          type: 'function_result';
          name: string;
          call_id: string;
          is_error?: boolean;
          result: Array<{ type: 'text'; text: string }>;
        }> = [];
        for (const step of calls) {
          try {
            const output = await this.execute(ctx, step.name, (step.arguments ?? {}) as ToolArgs);
            results.push({ type: 'function_result', name: step.name, call_id: step.id, result: [{ type: 'text', text: JSON.stringify(output) }] });
          } catch (error) {
            results.push({
              type: 'function_result',
              name: step.name,
              call_id: step.id,
              is_error: true,
              result: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
            });
          }
        }

        interaction = await client.interactions.create({
          model: GEMINI_MODEL,
          tools: ALL_TOOLS,
          previous_interaction_id: interaction.id,
          input: results,
        });
        inputTokens += interaction.usage?.total_input_tokens ?? 0;
        outputTokens += interaction.usage?.total_output_tokens ?? 0;
      }

      const text = (interaction.output_text ?? '').trim();
      const handled = text.length > 0 && text !== NOT_HANDLED;
      const data = {
        aiInteractionId: handled ? interaction.id : null,
        aiInteractionAt: handled ? new Date() : null,
        ...(ctx.pending
          ? { pendingAiAction: ctx.pending.action as unknown as Prisma.InputJsonValue, pendingAiActionTurn: ctx.pending.turnId }
          : { pendingAiAction: Prisma.DbNull, pendingAiActionTurn: null }),
      };
      if (channel.kind === 'line') {
        await this.prisma.lineAccountLink.update({ where: { id: channel.linkId }, data });
      } else {
        await this.prisma.appAiSession.upsert({
          where: { userId: params.userId },
          create: { userId: params.userId, ...data },
          update: data,
        });
      }
      return { handled, reply: handled ? text : '', interactionId: interaction.id };
    } catch (error) {
      status = AiUsageStatus.FAILED;
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('萬用 AI 處理失敗', error as Error);
      throw error;
    } finally {
      await this.aiUsage.record({
        userId: params.userId,
        feature: channel.kind === 'line' ? 'line_ai_agent' : 'ai_assistant_app',
        model: GEMINI_MODEL,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startedAt,
        status,
        errorMessage,
      });
    }
  }

  // --- context ---

  private async buildContext(userId: string, channel: AgentChannel, state: AgentState | null): Promise<AgentContext> {
    const [personal, calendar] = await Promise.all([
      this.prisma.space.findUnique({ where: { ownerUserId: userId } }),
      this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } }),
    ]);
    const connectedTargets: CalendarSyncTarget[] = [];
    if (calendar) {
      const [google, apple] = await Promise.all([
        this.prisma.googleCalendarConnection.findUnique({ where: { spaceId: calendar.id } }),
        this.prisma.appleCalendarConnection.findUnique({ where: { spaceId: calendar.id } }),
      ]);
      if (google) connectedTargets.push(CalendarSyncTarget.GOOGLE);
      if (apple) connectedTargets.push(CalendarSyncTarget.ICLOUD);
    }
    // A pending action only survives while its conversation is still live.
    const pending =
      state?.pendingAiAction
        ? { action: state.pendingAiAction as unknown as PendingAction, turnId: state.pendingAiActionTurn }
        : null;
    return {
      userId,
      channel,
      journalPrompted: false,
      turnId: randomUUID(),
      personalSpaceId: personal?.id ?? null,
      calendarSpaceId: calendar?.id ?? null,
      connectedTargets,
      pending,
    };
  }

  private async systemInstruction(ctx: AgentContext): Promise<string> {
    const now = new Date();
    const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const today = `${taipeiDateKey(now)}（星期${WEEKDAYS[shifted.getUTCDay()]}）${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;

    const [accounts, categories, goalCategories] = await Promise.all([
      ctx.personalSpaceId
        ? this.prisma.financeAccount.findMany({ where: { spaceId: ctx.personalSpaceId }, orderBy: { sortOrder: 'asc' } })
        : [],
      ctx.personalSpaceId ? this.prisma.financeCategory.findMany({ where: { spaceId: ctx.personalSpaceId } }) : [],
      this.prisma.lifeGoal.findMany({
        where: { ownerUserId: ctx.userId, category: { not: null } },
        select: { category: true },
        distinct: ['category'],
      }),
    ]);
    const leaves = leafCategories(categories);
    const expense = leaves.filter((c) => c.kind === FinanceCategoryKind.EXPENSE).map((c) => c.name);
    const income = leaves.filter((c) => c.kind === FinanceCategoryKind.INCOME).map((c) => c.name);
    const targets = ctx.connectedTargets.map((t) => `${t}＝${TARGET_LABEL[t]}`).join('、') || '（沒有連結任何外部行事曆，行程只存在元序，不用問存哪）';

    return [
      `你是「元序」的生活助理（使用者現在在${ctx.channel.kind === 'line' ? ' LINE ' : ' App 的 AI 問答'}跟你聊），像一個熟悉使用者生活的真人朋友兼秘書，用自然口語聊天。` +
      '使用者跟你說要記帳、新增代辦、排行程、記錄人生目標、記睡眠運動、找收藏的內容、規劃生活，或只是閒聊、問意見，你都接得住；需要動到資料就用工具完成。',
      `現在是 ${today}（台北時間）。「明天」「下週三」這類說法都以這個日期換算成 YYYY-MM-DD。`,
      '',
      '【記帳】',
      `帳戶：${accounts.map((a) => a.name).join('、') || '（還沒有帳戶）'}`,
      `支出分類：${expense.join('、') || '（無）'}`,
      `收入分類：${income.join('、') || '（無）'}`,
      '分類一律從上面挑意思最接近的；使用者沒講帳戶就不要填 accountName，系統猜完你要問他確認。使用者說「改成 X 帳戶」就用 accountName=X 重新 record_transaction。',
      '',
      '【行程】',
      `已連結的行事曆：${targets}`,
      '新增行程或有日期的代辦時，使用者沒講存哪一邊（而且有連結）就一定要先問，不能自己決定。',
      '使用者有講時間 → create_calendar_event。只講要做什麼、沒講時間 → 先判斷是工作還是私人的事，find_free_slots，再用 propose_calendar_event 提議第一個時段（順便列出其他選項），等他確認。',
      '',
      '【人生目標】',
      `使用者已有的目標分類：${goalCategories.map((g) => g.category).join('、') || '（無）'}`,
      '先 list_life_goals 看有哪些目標再判斷對應哪一個；說法不同但意思一樣（「看完一本設計書」對「一年讀12本書」）就對應同一個，不要另開新目標。打卡要心得而使用者沒給，先問「最喜歡的一句話或心得是什麼？」。',
      '',
      '【知識庫】',
      KNOWLEDGE_AI_GUIDE + '想去看展可以接著 find_free_slots 幫他排時間。',
      '',
      '【日記】',
      JOURNAL_AI_GUIDE,
      ...(ctx.journalPrompted ? ['今晚你剛用 LINE 問過他「今天過得怎樣？」——這則訊息如果是在講今天，就記成日記。'] : []),
      '',
      '【健康】',
      HEALTH_AI_GUIDE,
      '',
      '【股票】',
      STOCK_AI_GUIDE,
      '講股票買賣（「買了 3 張 0050 成交 152」）就 propose_stock_trade。',
      '',
      '【理財評估】',
      '講薪水、問「薪水怎麼分配」「幫我做理財評估」→ 沒設固定薪資就先 set_fixed_income（問清楚金額和發薪日），再 get_financial_plan_inputs，依實際花費給：每月分配（固定支出/生活費/儲蓄/投資各多少）、3～5 個分類的建議預算、接下來 3 步。最後問他要不要幫他把預算設好 → propose_budgets。',
      '',
      '【財務規劃】',
      '問財務狀況、要做財務規劃時：先 get_financial_health 拿分數跟每項建議，存錢目標再 list_life_goals 看進度，算出「每月要存多少、預備金還差多少、先還哪筆債」，用具體數字給 3 個以內的優先步驟。分數是規則算的，照實說不要自己改分數。',
      '',
      '【規劃】',
      '使用者要你幫忙規劃（這週怎麼安排、今天先做什麼、這個月預算、目標怎麼達成）時：先用 list_calendar_events、list_todos、list_life_goals、get_finance_overview 看他真實的行程、代辦、目標、收支，再給具體建議（排出時間表、列出優先順序、算出每月要存多少）。',
      '要一次排好幾個行程時，先用文字列出整份計畫問他，他同意後再逐一 create_calendar_event；只有一個就用 propose_calendar_event。',
      '',
      '【算命】',
      DIVINATION_AI_GUIDE,
      '',
      '【借貸／代墊／修改／刪除】',
      RECORD_AI_GUIDE,
      '',
      '【等確認的動作】',
      ctx.pending ? `目前有一個等使用者確認的動作：${ctx.pending.action.summary}。使用者這則訊息如果是同意就 confirm_pending_action，不要就 cancel_pending_action，要改內容就重新提議。` : '目前沒有。',
      '',
      '【其他】',
      '查詢問題（這個月花多少、有哪些代辦）用 get_/list_ 工具查真實資料再回答，不要瞎猜數字。',
      `打招呼、閒聊、心情、生活問題、一般知識都像朋友一樣自然回應。只有訊息是亂碼或完全看不懂時，才只回覆 ${NOT_HANDLED}。`,
      '回覆一律繁體中文、口語、簡短（聊天訊息，畫面不支援 Markdown，不要用 ** 或 #）；做了事就一兩句說明做了什麼或需要他補什麼，規劃建議可以條列但要精簡。',
    ].join('\n');
  }

  // --- tools ---

  private async execute(ctx: AgentContext, name: string, args: ToolArgs): Promise<unknown> {
    if (QUERY_TOOL_NAMES.has(name)) return this.queryTools.execute(ctx.userId, name, args);
    if (LifeGoalAiService.toolNames.has(name)) return this.goalTools.execute(ctx.userId, name, args);
    if (KnowledgeAiService.toolNames.has(name)) return this.knowledgeTools.execute(ctx.userId, name, args);
    if (RecordToolsService.toolNames.has(name)) {
      const out = await this.recordTools.execute(ctx.userId, name, args);
      if (out && typeof out === 'object' && 'pending' in out) {
        const pending = (out as { pending: RecordPending }).pending;
        ctx.pending = { action: pending, turnId: ctx.turnId };
        return { needsConfirmation: true, summary: pending.summary };
      }
      return out;
    }
    if (DivinationAiService.toolNames.has(name)) return this.divinationTools.execute(ctx.userId, name, args);
    if (JournalAiService.toolNames.has(name)) return this.journalTools.execute(ctx.userId, name, args);
    if (HealthAiService.toolNames.has(name)) return this.healthTools.execute(ctx.userId, name, args);
    if (StockAiService.toolNames.has(name)) return this.stockTools.execute(ctx.userId, name, args);

    switch (name) {
      case 'record_transaction':
        return this.recordTransaction(ctx, args);
      case 'create_todo':
        return this.createTodo(ctx, args);
      case 'complete_todo': {
        const todo = await this.todos.update(ctx.userId, String(args.todoId), { done: true });
        return { completed: todo.title };
      }
      case 'create_calendar_event': {
        const data = this.calendarEventData(ctx, args);
        const event = await this.calendarEvents.create(ctx.userId, this.requireCalendarSpace(ctx), {
          ...data,
          location: data.location ?? undefined,
          notes: data.notes ?? undefined,
          endAt: data.endAt ?? undefined,
          syncTarget: data.syncTarget ?? undefined,
        });
        return { created: event.title, when: describeEvent(data), savedTo: data.syncTarget ? TARGET_LABEL[data.syncTarget] : '元序' };
      }
      case 'find_free_slots':
        return this.findSlots(ctx, args);
      case 'propose_calendar_event': {
        const data = this.calendarEventData(ctx, args);
        const summary = `新增行程「${data.title}」${describeEvent(data)}${data.syncTarget ? `，存到 ${TARGET_LABEL[data.syncTarget]}` : ''}`;
        ctx.pending = { action: { kind: 'calendar_event', summary, data }, turnId: ctx.turnId };
        return { needsConfirmation: true, summary };
      }
      case 'get_financial_plan_inputs':
        return this.financePlan.inputs(ctx.userId);
      case 'set_fixed_income':
        return this.financePlan.setFixedIncome(ctx.userId, {
          amount: Number(args.amount),
          dayOfMonth: Number(args.dayOfMonth),
          ...(typeof args.accountName === 'string' && args.accountName && { accountName: args.accountName }),
        });
      case 'propose_budgets': {
        const items = (Array.isArray(args.budgets) ? args.budgets : [])
          .map((b) => b as { categoryName?: unknown; monthlyAmount?: unknown })
          .map((b) => ({ categoryName: String(b.categoryName ?? ''), monthlyAmount: Number(b.monthlyAmount) }))
          .filter((b) => b.categoryName && b.monthlyAmount > 0);
        if (items.length === 0) throw new Error('沒有可以設定的預算');
        const summary = `設定每月預算：${items.map((b) => `${b.categoryName} ${Math.round(b.monthlyAmount).toLocaleString('en-US')}`).join('、')}`;
        ctx.pending = { action: { kind: 'budgets', summary, data: items }, turnId: ctx.turnId };
        return { needsConfirmation: true, summary };
      }
      case 'get_financial_health':
        return (await this.financeHealth.forUser(ctx.userId)) ?? { error: '找不到個人空間' };
      case 'get_life_review':
        return (await this.lifeReview.build(ctx.userId, args.period === 'month' ? 'month' : 'week')) ?? '這段時間還沒有記錄';
      case 'confirm_pending_action':
        return this.confirmPending(ctx);
      case 'cancel_pending_action':
        ctx.pending = null;
        return { cancelled: true };
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }

  private async recordTransaction(ctx: AgentContext, args: ToolArgs) {
    const spaceId = ctx.personalSpaceId;
    if (!spaceId) throw new Error('找不到個人空間，請先登入 App 一次');
    const type = args.type === 'INCOME' ? FinanceTransactionType.INCOME : FinanceTransactionType.EXPENSE;
    const amount = Number(args.amount);
    if (!(amount > 0)) throw new Error('金額要大於 0');

    const [accounts, categories] = await Promise.all([
      this.prisma.financeAccount.findMany({ where: { spaceId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.financeCategory.findMany({ where: { spaceId } }),
    ]);
    if (accounts.length === 0) throw new Error('還沒有任何帳戶，請先到 App 的記帳新增帳戶');

    const kind = type === FinanceTransactionType.INCOME ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE;
    const leaves = leafCategories(categories).filter((c) => c.kind === kind);
    const wantedCategory = String(args.categoryName ?? '');
    const category =
      leaves.find((c) => c.name === wantedCategory) ??
      leaves.find((c) => c.name.includes(wantedCategory) || wantedCategory.includes(c.name));
    if (!category) throw new Error(`沒有「${wantedCategory}」這個分類，可用的：${leaves.map((c) => c.name).join('、')}`);

    const date = typeof args.date === 'string' && args.date ? args.date : taipeiDateKey(new Date());
    const note = typeof args.note === 'string' && args.note.trim() ? args.note.trim() : null;

    const wantedAccount = typeof args.accountName === 'string' ? args.accountName.trim() : '';
    if (wantedAccount) {
      const account =
        accounts.find((a) => a.name === wantedAccount) ??
        accounts.find((a) => a.name.includes(wantedAccount) || wantedAccount.includes(a.name));
      if (!account) throw new Error(`沒有「${wantedAccount}」這個帳戶，可用的：${accounts.map((a) => a.name).join('、')}`);
      // An explicit account replaces any guessed-account proposal in flight.
      ctx.pending = null;
      return this.writeTransaction(ctx, { type, amount, accountId: account.id, categoryId: category.id, date, note }, account.name, category.name);
    }

    const guessed = await this.guessAccount(spaceId, category.id, accounts);
    const typeLabel = type === FinanceTransactionType.INCOME ? '收入' : '支出';
    const summary = `記一筆${typeLabel} ${amount.toLocaleString('en-US')}（${category.name}）${note ? `「${note}」` : ''}，帳戶：${guessed.name}`;
    ctx.pending = {
      action: { kind: 'transaction', summary, data: { type, amount, accountId: guessed.id, categoryId: category.id, date, note } },
      turnId: ctx.turnId,
    };
    return { needsConfirmation: true, guessedAccount: guessed.name, summary };
  }

  /** Most-used account for this category over the last 180 days, else the
   * most-used account overall, else the first one. */
  private async guessAccount(spaceId: string, categoryId: string, accounts: Array<{ id: string; name: string }>) {
    const since = new Date(Date.now() - 180 * MS_PER_DAY);
    for (const where of [
      { spaceId, categoryId, date: { gte: since } },
      { spaceId, date: { gte: since } },
    ]) {
      const top = await this.prisma.financeTransaction.groupBy({
        by: ['accountId'],
        where,
        _count: { accountId: true },
        orderBy: { _count: { accountId: 'desc' } },
        take: 1,
      });
      const account = top[0] && accounts.find((a) => a.id === top[0].accountId);
      if (account) return account;
    }
    return accounts[0];
  }

  private async writeTransaction(ctx: AgentContext, data: TransactionData, accountName?: string, categoryName?: string) {
    const tx = await this.transactions.create(ctx.userId, ctx.personalSpaceId!, {
      type: data.type as FinanceTransactionType,
      amount: data.amount,
      accountId: data.accountId,
      categoryId: data.categoryId,
      date: data.date,
      ...(data.note && { note: data.note }),
    });
    return { recorded: true, amount: tx.amount, account: accountName, category: categoryName, date: data.date };
  }

  private async createTodo(ctx: AgentContext, args: ToolArgs) {
    const dueDate = typeof args.dueDate === 'string' && args.dueDate ? args.dueDate : null;
    const dueTime = parseClock(typeof args.dueTime === 'string' ? args.dueTime : undefined);
    const target = this.resolveTarget(ctx, args.calendarTarget, dueDate != null);

    let dueIso: string | undefined;
    if (dueDate) {
      const [y, m, d] = dueDate.split('-').map(Number);
      dueIso = dueTime == null ? dueDate : taipeiWallClockToUtc(y, m - 1, d, Math.floor(dueTime / 60), dueTime % 60).toISOString();
    }
    const todo = await this.todos.create(ctx.userId, {
      title: String(args.title),
      ...(dueIso ? { dueDate: dueIso, dueDateAllDay: dueTime == null } : { isOngoing: true }),
      ...(typeof args.notes === 'string' && args.notes && { notes: args.notes }),
      ...(target && { calendarSyncTarget: target }),
    });
    return {
      created: todo.title,
      due: dueDate ? `${dueDate}${dueTime == null ? '' : ` ${args.dueTime}`}` : '持續性任務',
      calendar: dueDate ? (target ? TARGET_LABEL[target] : '元序') : null,
    };
  }

  /** Rule (2026-09-30): anything that lands on the calendar must say Google
   * or iPhone when either is connected — never defaulted. */
  private resolveTarget(ctx: AgentContext, raw: unknown, needed: boolean): CalendarSyncTarget | null {
    if (!needed || ctx.connectedTargets.length === 0) return null;
    const target = raw === 'GOOGLE' || raw === 'ICLOUD' ? (raw as CalendarSyncTarget) : null;
    if (!target) {
      throw new Error(`還不知道要存到哪個行事曆，請先問使用者：${ctx.connectedTargets.map((t) => TARGET_LABEL[t]).join(' 還是 ')}？`);
    }
    if (!ctx.connectedTargets.includes(target)) {
      throw new Error(`使用者沒有連結 ${TARGET_LABEL[target]}，只能選：${ctx.connectedTargets.map((t) => TARGET_LABEL[t]).join('、')}`);
    }
    return target;
  }

  private requireCalendarSpace(ctx: AgentContext): string {
    if (!ctx.calendarSpaceId) throw new Error('這個使用者還沒有行事曆空間，請先到 App 開啟行事曆');
    return ctx.calendarSpaceId;
  }

  private calendarEventData(ctx: AgentContext, args: ToolArgs): CalendarEventData {
    const date = String(args.date ?? '');
    const [y, m, d] = date.split('-').map(Number);
    if (!y || !m || !d) throw new Error('日期格式要是 YYYY-MM-DD');
    const start = parseClock(typeof args.startTime === 'string' ? args.startTime : undefined);
    const end = parseClock(typeof args.endTime === 'string' ? args.endTime : undefined);
    const syncTarget = this.resolveTarget(ctx, args.target, true);
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    if (start == null) {
      const endDate = text(args.endDate);
      return {
        title: String(args.title),
        startAt: date,
        endAt: endDate,
        allDay: true,
        location: text(args.location),
        notes: text(args.notes),
        syncTarget,
      };
    }
    const startAt = taipeiWallClockToUtc(y, m - 1, d, Math.floor(start / 60), start % 60);
    const endAt = end != null ? taipeiWallClockToUtc(y, m - 1, d, Math.floor(end / 60), end % 60) : null;
    return {
      title: String(args.title),
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      allDay: false,
      location: text(args.location),
      notes: text(args.notes),
      syncTarget,
    };
  }

  private async findSlots(ctx: AgentContext, args: ToolArgs) {
    const calendarSpaceId = this.requireCalendarSpace(ctx);
    const kind: ScheduleKind = args.kind === 'WORK' ? 'WORK' : 'PERSONAL';
    const durationMinutes = Math.max(15, Number(args.durationMinutes) || 60);
    const dateStart = (key: string) => {
      const [y, m, d] = key.split('-').map(Number);
      return taipeiWallClockToUtc(y, m - 1, d, 0, 0);
    };
    const now = new Date();
    const from = typeof args.earliestDate === 'string' && args.earliestDate ? new Date(Math.max(dateStart(args.earliestDate).getTime(), now.getTime())) : now;
    const to =
      typeof args.latestDate === 'string' && args.latestDate
        ? new Date(dateStart(args.latestDate).getTime() + MS_PER_DAY - 1)
        : new Date(from.getTime() + 7 * MS_PER_DAY);
    const ws = parseClock(typeof args.windowStart === 'string' ? args.windowStart : undefined);
    const we = parseClock(typeof args.windowEnd === 'string' ? args.windowEnd : undefined);

    const events = await this.calendarEvents.listForSpace(calendarSpaceId, from.toISOString(), to.toISOString());
    const busy = events
      .filter((e) => !e.allDay)
      .map((e) => ({ start: e.startAt, end: e.endAt ?? new Date(e.startAt.getTime() + 60 * 60 * 1000) }));
    const allDayNotes = events.filter((e) => e.allDay).map((e) => `${taipeiDateKey(e.startAt)} 全天：${e.title}`);

    const slots = findFreeSlots({
      kind,
      durationMinutes,
      from,
      to,
      busy,
      ...(ws != null && we != null && we > ws && { customWindow: { startMinute: ws, endMinute: we } }),
    });
    return {
      kind: kind === 'WORK' ? '工作時段（平日 8:00–18:00）' : '私人時段（平日 19:00–23:00、假日 10:00–22:00）',
      slots: slots.map((s) => ({ date: taipeiDateKey(s.start), startTime: clock(s.start), endTime: clock(s.end), label: slotLabel(s.start, s.end) })),
      ...(slots.length === 0 && { message: '這段期間找不到空檔，可以問使用者要不要放寬日期或時段' }),
      ...(allDayNotes.length > 0 && { allDayEventsInRange: allDayNotes }),
    };
  }

  private async confirmPending(ctx: AgentContext) {
    const pending = ctx.pending;
    if (!pending) throw new Error('目前沒有等確認的動作');
    // The model can't propose and confirm in the same breath — the "yes"
    // has to come from a later message the user actually sent.
    if (pending.turnId === ctx.turnId) {
      throw new Error('要等使用者回覆同意之後才能確認，先問他');
    }
    ctx.pending = null;
    const action = pending.action;
    if (action.kind === 'transaction') {
      return { ...(await this.writeTransaction(ctx, action.data)), done: action.summary };
    }
    if (action.kind === 'budgets') {
      const applied = await this.financePlan.applyBudgets(ctx.userId, action.data);
      return { done: applied.length > 0 ? `已設定：${applied.join('、')}` : '沒有找到對應的分類' };
    }
    if (action.kind !== 'calendar_event') {
      return this.recordTools.run(ctx.userId, action);
    }
    const data = action.data;
    const event = await this.calendarEvents.create(ctx.userId, this.requireCalendarSpace(ctx), {
      title: data.title,
      startAt: data.startAt,
      allDay: data.allDay,
      ...(data.endAt && { endAt: data.endAt }),
      ...(data.location && { location: data.location }),
      ...(data.notes && { notes: data.notes }),
      ...(data.syncTarget && { syncTarget: data.syncTarget }),
    });
    return { created: event.title, when: describeEvent(data) };
  }
}

function leafCategories<T extends { id: string; parentId: string | null }>(categories: T[]): T[] {
  const parentIds = new Set(categories.filter((c) => c.parentId).map((c) => c.parentId!));
  return categories.filter((c) => !parentIds.has(c.id));
}

function clock(d: Date): string {
  const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

function slotLabel(start: Date, end: Date): string {
  const shifted = new Date(start.getTime() + 8 * 60 * 60 * 1000);
  return `${shifted.getUTCMonth() + 1}/${shifted.getUTCDate()}（${WEEKDAYS[shifted.getUTCDay()]}）${clock(start)}–${clock(end)}`;
}

function describeEvent(data: CalendarEventData): string {
  if (data.allDay) return data.endAt && data.endAt !== data.startAt ? `${data.startAt}～${data.endAt} 全天` : `${data.startAt} 全天`;
  const start = new Date(data.startAt);
  return data.endAt ? slotLabel(start, new Date(data.endAt)) : `${slotLabel(start, start).split('–')[0]}`;
}
