import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import {
  AiUsageStatus,
  LifeGoalPeriod,
  LifeGoalStatus,
  LifeGoalTrackingType,
} from '../../generated/prisma/client.js';
import { taipeiDateKey } from '../common/taipei-date';
import { LifeGoalsService } from './life-goals.service';

const MAX_TOOL_ROUNDS = 5;
/** What the model answers with when the message has nothing to do with goals. */
export const NOT_A_GOAL_MESSAGE = 'NOT_GOAL';

const TRACKING_LABEL: Record<LifeGoalTrackingType, string> = {
  MANUAL: '手動更新數字',
  ACCOUNT_BALANCE: '自動：帳戶餘額',
  NET_WORTH: '自動：淨資產',
  NOTE_KEYWORD_SUM: '自動：記帳備註關鍵字累計',
  STOCK_VALUE: '自動：持股市值',
  CHECK_IN: '打卡',
};

const TOOLS = [
  {
    type: 'function' as const,
    name: 'list_life_goals',
    description: '列出使用者所有進行中的人生目標（含 id、追蹤方式、目前數字、目標數字、打卡是否必須寫心得）。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'set_goal_value',
    description: '把「手動更新數字」型目標的目前數字改成指定值（例如體重現在 72）。只能用在追蹤方式是手動的目標。',
    parameters: {
      type: 'object',
      properties: { goalId: { type: 'string' }, value: { type: 'number' } },
      required: ['goalId', 'value'],
    },
  },
  {
    type: 'function' as const,
    name: 'add_check_in',
    description:
      '替「打卡」型目標新增一筆打卡（讀完一本書、運動一次…）。title 是這次做了什麼（例如書名），note 是心得或最喜歡的一句話；目標若要求必須寫心得，沒有 note 會失敗，這時要先問使用者。value 預設 1，有數量時（跑了 5 公里）才填。',
    parameters: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        title: { type: 'string' },
        note: { type: 'string' },
        value: { type: 'number' },
        date: { type: 'string', description: 'YYYY-MM-DD，不填則為今天' },
      },
      required: ['goalId'],
    },
  },
  {
    type: 'function' as const,
    name: 'create_goal',
    description:
      '新增人生目標。trackingType：MANUAL（手動數字，例如體重）、CHECK_IN（打卡，例如讀書、運動）、NET_WORTH（淨資產）、NOTE_KEYWORD_SUM（記帳備註含關鍵字的存款累計，需 trackingKeyword）、ACCOUNT_BALANCE（指定帳戶餘額，需 accountName）。讀書類目標請設 CHECK_IN 且 requireCheckInNote=true。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: { type: 'string', description: '財務／健康／學習／工作／人際／生活，或使用者指定的' },
        trackingType: {
          type: 'string',
          enum: ['MANUAL', 'CHECK_IN', 'NET_WORTH', 'NOTE_KEYWORD_SUM', 'ACCOUNT_BALANCE'],
        },
        targetValue: { type: 'number' },
        currentValue: { type: 'number', description: '只有 MANUAL 用得到' },
        unit: { type: 'string' },
        targetDate: { type: 'string', description: 'YYYY-MM-DD' },
        checkInPeriod: { type: 'string', enum: ['TOTAL', 'WEEKLY', 'MONTHLY'] },
        requireCheckInNote: { type: 'boolean' },
        trackingKeyword: { type: 'string' },
        accountName: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    type: 'function' as const,
    name: 'set_goal_status',
    description: '把目標標記為完成（COMPLETED）、放棄（ABANDONED）或重新開始（ACTIVE）。',
    parameters: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'ABANDONED'] },
      },
      required: ['goalId', 'status'],
    },
  },
];

function systemInstruction(): string {
  return [
    '你是「元序」App 的人生目標助理，透過 LINE 幫使用者用聊天的方式記錄目標進度。',
    `今天是 ${taipeiDateKey(new Date())}（台北時間）。`,
    '先呼叫 list_life_goals 看使用者有哪些目標，再判斷訊息對應哪一個目標、要做什麼（更新數字／打卡／新增目標／標記完成）。',
    '對應不到或有兩個以上可能時，直接問使用者是哪一個，不要亂猜。',
    '打卡型目標若要求心得而使用者沒給，先問「最喜歡的一句話或心得是什麼？」，拿到後再打卡。',
    '自動追蹤的目標（帳戶餘額、淨資產、備註關鍵字、持股市值）數字是系統自動算的，不能手動改——告訴使用者去記帳就會自動更新。',
    '你不提供任何投資建議，也不評論持股。',
    `如果訊息跟人生目標完全無關（例如記帳、行事曆、閒聊），只回覆 ${NOT_A_GOAL_MESSAGE} 這幾個字，不要呼叫工具。`,
    '完成動作後用一兩句繁體中文回報結果，附上最新進度。',
  ].join('\n');
}

export interface LifeGoalAiResult {
  handled: boolean;
  reply: string;
  interactionId: string | null;
}

/** LINE 人生目標 natural-language entry (user's choice 2026-09-30: 「像聊天一樣
 * 講（AI 理解）」). Unlike `AiAssistantService` (read-only Q&A), this one
 * writes — but only through `LifeGoalsService`, so every validation rule
 * (required check-in note, auto-tracked goals can't be hand-edited, account
 * ownership) applies exactly as it does from the App. */
@Injectable()
export class LifeGoalAiService {
  private readonly logger = new Logger(LifeGoalAiService.name);

  constructor(
    private readonly goals: LifeGoalsService,
    private readonly aiUsage: AiUsageService,
  ) {}

  async handle(params: {
    userId: string;
    apiKey: string;
    text: string;
    previousInteractionId?: string | null;
  }): Promise<LifeGoalAiResult> {
    const client = new GoogleGenAI({ apiKey: params.apiKey });
    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let status: AiUsageStatus = AiUsageStatus.SUCCESS;
    let errorMessage: string | undefined;

    try {
      let interaction = await client.interactions.create({
        model: GEMINI_MODEL,
        system_instruction: systemInstruction(),
        tools: TOOLS,
        ...(params.previousInteractionId && { previous_interaction_id: params.previousInteractionId }),
        input: params.text,
      });
      inputTokens += interaction.usage?.total_input_tokens ?? 0;
      outputTokens += interaction.usage?.total_output_tokens ?? 0;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const calls = (interaction.steps ?? []).filter(
          (step): step is typeof step & { type: 'function_call' } => step.type === 'function_call',
        );
        if (calls.length === 0) break;

        const results = await Promise.all(
          calls.map(async (step) => {
            try {
              const output = await this.execute(params.userId, step.name, (step.arguments ?? {}) as Record<string, unknown>);
              return {
                type: 'function_result' as const,
                name: step.name,
                call_id: step.id,
                result: [{ type: 'text' as const, text: JSON.stringify(output) }],
              };
            } catch (error) {
              return {
                type: 'function_result' as const,
                name: step.name,
                call_id: step.id,
                is_error: true,
                result: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
              };
            }
          }),
        );

        interaction = await client.interactions.create({
          model: GEMINI_MODEL,
          tools: TOOLS,
          previous_interaction_id: interaction.id,
          input: results,
        });
        inputTokens += interaction.usage?.total_input_tokens ?? 0;
        outputTokens += interaction.usage?.total_output_tokens ?? 0;
      }

      const text = (interaction.output_text ?? '').trim();
      if (!text || text === NOT_A_GOAL_MESSAGE) {
        return { handled: false, reply: '', interactionId: null };
      }
      return { handled: true, reply: text, interactionId: interaction.id };
    } catch (error) {
      status = AiUsageStatus.FAILED;
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('人生目標 AI 處理失敗', error as Error);
      throw error;
    } finally {
      await this.aiUsage.record({
        userId: params.userId,
        feature: 'life_goal_line',
        model: GEMINI_MODEL,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startedAt,
        status,
        errorMessage,
      });
    }
  }

  private async execute(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'list_life_goals': {
        const goals = await this.goals.listAll(userId, LifeGoalStatus.ACTIVE);
        return goals.map((g) => ({
          id: g.id,
          title: g.title,
          category: g.category,
          trackingType: TRACKING_LABEL[g.trackingType],
          checkInPeriod: g.trackingType === LifeGoalTrackingType.CHECK_IN ? g.checkInPeriod : undefined,
          requireCheckInNote: g.requireCheckInNote,
          // 持股市值不給模型看——這個助理不碰任何投資資料。
          currentValue: g.trackingType === LifeGoalTrackingType.STOCK_VALUE ? '（不提供）' : g.currentValue,
          targetValue: g.targetValue,
          startValue: g.startValue,
          unit: g.unit,
          targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null,
        }));
      }
      case 'set_goal_value': {
        const goal = await this.goals.getOne(userId, String(args.goalId));
        if (goal.trackingType !== LifeGoalTrackingType.MANUAL) {
          throw new Error('這個目標是自動追蹤的，數字不能手動改');
        }
        const updated = await this.goals.update(userId, goal.id, { currentValue: Number(args.value) });
        return { title: updated.title, currentValue: updated.currentValue, targetValue: updated.targetValue, unit: updated.unit };
      }
      case 'add_check_in': {
        const goalId = String(args.goalId);
        await this.goals.addCheckIn(userId, goalId, {
          title: args.title as string | undefined,
          note: args.note as string | undefined,
          value: args.value as number | undefined,
          date: args.date as string | undefined,
        });
        const goal = await this.goals.getOne(userId, goalId);
        return { title: goal.title, currentValue: goal.currentValue, targetValue: goal.targetValue, unit: goal.unit, period: goal.checkInPeriod };
      }
      case 'create_goal': {
        const trackingType = (args.trackingType as LifeGoalTrackingType | undefined) ?? LifeGoalTrackingType.MANUAL;
        let trackingAccountId: string | undefined;
        if (trackingType === LifeGoalTrackingType.ACCOUNT_BALANCE) {
          const { accounts } = await this.goals.trackingOptions(userId);
          const wanted = String(args.accountName ?? '');
          const match = accounts.find((a) => a.name === wanted) ?? accounts.find((a) => a.name.includes(wanted) || wanted.includes(a.name));
          if (!match) throw new Error(`找不到帳戶「${wanted}」，現有帳戶：${accounts.map((a) => a.name).join('、')}`);
          trackingAccountId = match.id;
        }
        const created = await this.goals.create(userId, {
          title: String(args.title),
          category: args.category as string | undefined,
          trackingType,
          targetValue: args.targetValue as number | undefined,
          currentValue: args.currentValue as number | undefined,
          unit: args.unit as string | undefined,
          targetDate: args.targetDate as string | undefined,
          checkInPeriod: args.checkInPeriod as LifeGoalPeriod | undefined,
          requireCheckInNote: args.requireCheckInNote as boolean | undefined,
          trackingKeyword: args.trackingKeyword as string | undefined,
          trackingAccountId,
        });
        return { id: created.id, title: created.title, trackingType: TRACKING_LABEL[created.trackingType], currentValue: created.currentValue, targetValue: created.targetValue };
      }
      case 'set_goal_status': {
        const updated = await this.goals.update(userId, String(args.goalId), { status: args.status as LifeGoalStatus });
        return { title: updated.title, status: updated.status };
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}
