import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AiUsageService } from '../../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../../knowledge/ai/gemini-content-analysis.service';
import { AI_QUERY_TOOLS, AiQueryToolsService } from '../../ai-assistant/ai-query-tools.service';
import { LIFE_GOAL_TOOLS, LifeGoalAiService } from '../../life-goals/life-goal-ai.service';
import { FinanceTransactionsService } from '../../finance/finance-transactions.service';
import { TodosService } from '../../todos/todos.service';
import { CalendarEventsService } from '../../calendar/calendar-events.service';
import { KnowledgeItemsService } from '../../knowledge/knowledge-items.service';
import { STOCK_TOOLS, StockAiService } from '../../stocks/stock-ai.service';
import { taipeiDateKey, taipeiWallClockToUtc } from '../../common/taipei-date';
import {
  AiUsageStatus,
  CalendarSyncTarget,
  FinanceCategoryKind,
  FinanceTransactionType,
  Prisma,
} from '../../../generated/prisma/client.js';
import type { LineAccountLink } from '../../../generated/prisma/client.js';
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
  | { kind: 'calendar_event'; summary: string; data: CalendarEventData };

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

const KNOWLEDGE_TOOLS = [
  {
    type: 'function' as const,
    name: 'search_knowledge',
    description:
      '搜尋使用者知識庫裡自己收藏的內容（文章、影片、筆記、美食、景點…）。keyword 比對標題、摘要、標籤；categoryName 是知識庫分類名稱（可不填）。兩個都不填＝最近收藏的。',
    parameters: {
      type: 'object',
      properties: { keyword: { type: 'string' }, categoryName: { type: 'string' } },
    },
  },
  {
    type: 'function' as const,
    name: 'search_places_near',
    description: '用地點找收藏過的美食或景點（比對地址），例如「信義區有什麼好吃的」→ categoryName=美食、location=信義。',
    parameters: {
      type: 'object',
      properties: {
        categoryName: { type: 'string', enum: ['美食', '景點'] },
        location: { type: 'string' },
      },
      required: ['categoryName', 'location'],
    },
  },
  {
    type: 'function' as const,
    name: 'list_upcoming_exhibitions',
    description: '列出收藏的展覽（依結束日期排序，含是否已觀展）。想去看展可以接著 find_free_slots 幫他排時間。',
    parameters: { type: 'object', properties: {} },
  },
];

const AGENT_TOOLS = [
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

const ALL_TOOLS = [...AI_QUERY_TOOLS, ...LIFE_GOAL_TOOLS, ...KNOWLEDGE_TOOLS, ...STOCK_TOOLS, ...AGENT_TOOLS];
const KNOWLEDGE_SUMMARY_MAX = 120;
const KNOWLEDGE_RESULT_MAX = 10;
const QUERY_TOOL_NAMES = new Set(AI_QUERY_TOOLS.map((t) => t.name));

interface AgentContext {
  userId: string;
  linkId: string;
  turnId: string;
  personalSpaceId: string | null;
  calendarSpaceId: string | null;
  connectedTargets: CalendarSyncTarget[];
  pending: { action: PendingAction; turnId: string | null } | null;
}

export interface AgentResult {
  handled: boolean;
  reply: string;
}

/** LINE 萬用 AI (2026-09-30): 記帳、代辦、行事曆（含自動找空檔）、人生目標、知識庫、生活規劃與閒聊、
 * 查詢 — everything by just talking. Every write goes through the same
 * service the App uses. Guessed values (記帳帳戶) and auto-picked times are
 * never written straight away: they become a `pendingAiAction` that only
 * runs when a LATER message confirms it (enforced here, not left to the
 * model). 股票只讀：看持股損益、分析走勢（2026-10-01 使用者要求），不記交易。 */
@Injectable()
export class LineAiAgentService {
  private readonly logger = new Logger(LineAiAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AiUsageService,
    private readonly queryTools: AiQueryToolsService,
    private readonly goalTools: LifeGoalAiService,
    private readonly transactions: FinanceTransactionsService,
    private readonly todos: TodosService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly knowledgeItems: KnowledgeItemsService,
    private readonly stockTools: StockAiService,
  ) {}

  static isConversationActive(link: Pick<LineAccountLink, 'aiInteractionId' | 'aiInteractionAt'>): boolean {
    return (
      link.aiInteractionId != null &&
      link.aiInteractionAt != null &&
      Date.now() - link.aiInteractionAt.getTime() < CONVERSATION_WINDOW_MS
    );
  }

  async handle(params: { link: LineAccountLink; apiKey: string; text: string }): Promise<AgentResult> {
    const { link } = params;
    const active = LineAiAgentService.isConversationActive(link);
    const ctx = await this.buildContext(link, active);
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
        ...(active && { previous_interaction_id: link.aiInteractionId! }),
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
      await this.prisma.lineAccountLink.update({
        where: { id: link.id },
        data: {
          aiInteractionId: handled ? interaction.id : null,
          aiInteractionAt: handled ? new Date() : null,
          ...(ctx.pending
            ? { pendingAiAction: ctx.pending.action as unknown as Prisma.InputJsonValue, pendingAiActionTurn: ctx.pending.turnId }
            : { pendingAiAction: Prisma.DbNull, pendingAiActionTurn: null }),
        },
      });
      return { handled, reply: handled ? text : '' };
    } catch (error) {
      status = AiUsageStatus.FAILED;
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('LINE 萬用 AI 處理失敗', error as Error);
      throw error;
    } finally {
      await this.aiUsage.record({
        userId: link.userId,
        feature: 'line_ai_agent',
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

  private async buildContext(link: LineAccountLink, active: boolean): Promise<AgentContext> {
    const [personal, calendar] = await Promise.all([
      this.prisma.space.findUnique({ where: { ownerUserId: link.userId } }),
      this.prisma.space.findUnique({ where: { calendarOwnerUserId: link.userId } }),
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
      active && link.pendingAiAction
        ? { action: link.pendingAiAction as unknown as PendingAction, turnId: link.pendingAiActionTurn }
        : null;
    return {
      userId: link.userId,
      linkId: link.id,
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
      '你是「元序」App 的 LINE 生活助理，像一個熟悉使用者生活的真人朋友兼秘書，用自然口語聊天。使用者跟你說要記帳、新增代辦、排行程、記錄人生目標、找收藏的內容、規劃生活，或只是閒聊、問意見，你都接得住；需要動到資料就用工具完成。',
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
      '問「之前存過的 XX」「附近有什麼好吃的」「有什麼展可以看」→ search_knowledge／search_places_near／list_upcoming_exhibitions 查真實收藏再回答，沒有就老實說沒有收藏過。',
      '',
      '【股票】',
      '問持股、損益、賺多少 → get_stock_portfolio。問某檔（或全部持股）走勢、怎麼看、要不要續抱 → analyze_stock_trend（全部持股就每檔都查），用算好的數據分析：短中期漲跌、股價在均線上還是下（多頭/空頭排列）、離高點多遠、波動大不大、量有沒有放大、跟他的成本比。',
      '分析要具體、講數字，可以說偏多/偏空/盤整以及要留意的價位，但最後提醒一句這是依過去價格的分析、不保證未來，決定權在他。不要編造新聞或財報數字，工具沒給的就說沒有資料。',
      '股票買賣的記錄還是請他用固定指令，例如「買股0050 152 3000 國泰世華」。',
      '',
      '【規劃】',
      '使用者要你幫忙規劃（這週怎麼安排、今天先做什麼、這個月預算、目標怎麼達成）時：先用 list_calendar_events、list_todos、list_life_goals、get_finance_overview 看他真實的行程、代辦、目標、收支，再給具體建議（排出時間表、列出優先順序、算出每月要存多少）。',
      '要一次排好幾個行程時，先用文字列出整份計畫問他，他同意後再逐一 create_calendar_event；只有一個就用 propose_calendar_event。',
      '',
      '【等確認的動作】',
      ctx.pending ? `目前有一個等使用者確認的動作：${ctx.pending.action.summary}。使用者這則訊息如果是同意就 confirm_pending_action，不要就 cancel_pending_action，要改內容就重新提議。` : '目前沒有。',
      '',
      '【其他】',
      '查詢問題（這個月花多少、有哪些代辦）用 get_/list_ 工具查真實資料再回答，不要瞎猜數字。',
      `打招呼、閒聊、心情、生活問題、一般知識都像朋友一樣自然回應。只有訊息是亂碼或完全看不懂時，才只回覆 ${NOT_HANDLED}。`,
      '回覆一律繁體中文、口語、簡短（LINE 訊息，不要用 Markdown 的 ** 或 #）；做了事就一兩句說明做了什麼或需要他補什麼，規劃建議可以條列但要精簡。',
    ].join('\n');
  }

  // --- tools ---

  private async execute(ctx: AgentContext, name: string, args: ToolArgs): Promise<unknown> {
    if (QUERY_TOOL_NAMES.has(name)) return this.queryTools.execute(ctx.userId, name, args);
    if (LifeGoalAiService.toolNames.has(name)) return this.goalTools.execute(ctx.userId, name, args);
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
      case 'search_knowledge':
        return this.searchKnowledge(ctx, args);
      case 'search_places_near': {
        const items = await this.knowledgeItems.searchByLocation(ctx.userId, String(args.categoryName), String(args.location ?? '').trim());
        return items.slice(0, KNOWLEDGE_RESULT_MAX).map((item) => this.describeKnowledgeItem(item));
      }
      case 'list_upcoming_exhibitions': {
        const items = await this.knowledgeItems.listUpcomingExhibitions(ctx.userId);
        return items.slice(0, KNOWLEDGE_RESULT_MAX).map((item) => ({
          ...this.describeKnowledgeItem(item),
          endDate: this.knowledgeItems.fieldDateValue(item, '結束日期')?.toISOString().slice(0, 10) ?? null,
          visited: this.knowledgeItems.fieldBooleanValue(item, '是否已觀展') ?? false,
        }));
      }
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

  private async searchKnowledge(ctx: AgentContext, args: ToolArgs) {
    const keyword = typeof args.keyword === 'string' && args.keyword.trim() ? args.keyword.trim() : undefined;
    const categoryName = typeof args.categoryName === 'string' ? args.categoryName.trim() : '';
    let categoryId: string | undefined;
    if (categoryName) {
      const categories = await this.prisma.knowledgeCategory.findMany({
        where: { ownerUserId: ctx.userId },
        select: { id: true, name: true },
      });
      const category =
        categories.find((c) => c.name === categoryName) ??
        categories.find((c) => c.name.includes(categoryName) || categoryName.includes(c.name));
      if (!category) throw new Error(`知識庫沒有「${categoryName}」這個分類，可用的：${categories.map((c) => c.name).join('、')}`);
      categoryId = category.id;
    }
    const page = await this.knowledgeItems.listOwn(ctx.userId, { search: keyword, categoryId, take: KNOWLEDGE_RESULT_MAX });
    return page.items.map((item) => this.describeKnowledgeItem(item));
  }

  private describeKnowledgeItem(item: Awaited<ReturnType<KnowledgeItemsService['listUpcomingExhibitions']>>[number]) {
    const summary = item.summary ?? '';
    return {
      title: item.title ?? '未命名',
      category: item.category?.name ?? null,
      summary: summary.length > KNOWLEDGE_SUMMARY_MAX ? `${summary.slice(0, KNOWLEDGE_SUMMARY_MAX)}…` : summary,
      address: this.knowledgeItems.fieldTextValue(item, '地址'),
      url: item.sourceUrl ?? null,
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
