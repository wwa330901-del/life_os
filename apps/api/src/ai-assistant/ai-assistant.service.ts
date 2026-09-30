import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiQueryToolsService, AI_QUERY_TOOLS } from './ai-query-tools.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';
import { KNOWLEDGE_AI_GUIDE, KNOWLEDGE_TOOLS, KnowledgeAiService } from '../knowledge/knowledge-ai.service';
import { STOCK_AI_GUIDE, STOCK_TOOLS, StockAiService } from '../stocks/stock-ai.service';
import { LIFE_GOAL_TOOLS, LifeGoalAiService } from '../life-goals/life-goal-ai.service';
import { taipeiDateKey } from '../common/taipei-date';

const MODEL = GEMINI_MODEL;
const MAX_TOOL_ROUNDS = 6;

// App 的 AI 問答只查不改（新增/修改在 App 畫面上做），所以人生目標只給列表。
const GOAL_READ_TOOLS = LIFE_GOAL_TOOLS.filter((t) => t.name === 'list_life_goals');
const TOOLS = [...AI_QUERY_TOOLS, ...KNOWLEDGE_TOOLS, ...STOCK_TOOLS, ...GOAL_READ_TOOLS];
const QUERY_TOOL_NAMES = new Set(AI_QUERY_TOOLS.map((t) => t.name));
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function systemInstruction(): string {
  const now = new Date();
  const weekday = WEEKDAYS[new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCDay()];
  return [
    '你是「元序」App 的個人生活助理，像熟悉使用者生活的朋友兼秘書，用自然口語回答。使用者會問他自己的記帳、代辦、行事曆、人生目標、知識庫收藏、股票，或請你幫忙規劃，也可能只是聊天、問意見。',
    `今天是 ${taipeiDateKey(now)}（星期${weekday}，台北時間）。`,
    '問到他的資料一律先用工具查真實資料再回答，不要瞎猜數字。',
    '',
    '【知識庫】',
    KNOWLEDGE_AI_GUIDE,
    '',
    '【股票】',
    STOCK_AI_GUIDE,
    '',
    '【規劃】',
    '要你幫忙規劃（這週怎麼安排、今天先做什麼、這個月預算、目標怎麼達成）時：先查 list_calendar_events、list_todos、list_life_goals、get_finance_overview，再給具體建議（時間表、優先順序、每月要存多少）。',
    '',
    '你在這裡只回答和建議，不會新增/修改/刪除資料；使用者要新增的話，告訴他可以在 App 畫面上做，或直接在 LINE 跟元序助理講（LINE 那邊可以幫他記帳、排行程、打卡）。',
    '回覆一律使用繁體中文，簡潔但完整。',
  ].join('\n');
}

export interface AskResult {
  answer: string;
  interactionId: string;
}

/** One user Q&A turn (App or LINE) against the user's own life_os data via
 * Gemini's Interactions API function-calling loop. Multi-turn continuity
 * (App's "session-only" chat) is carried entirely by the caller re-sending
 * `previousInteractionId` — this service itself keeps no conversation state
 * of its own, on this server or anywhere else. */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly tools: AiQueryToolsService,
    private readonly aiUsage: AiUsageService,
    private readonly knowledgeTools: KnowledgeAiService,
    private readonly stockTools: StockAiService,
    private readonly goalTools: LifeGoalAiService,
  ) {}

  private runTool(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    if (QUERY_TOOL_NAMES.has(name)) return this.tools.execute(userId, name, args);
    if (KnowledgeAiService.toolNames.has(name)) return this.knowledgeTools.execute(userId, name, args);
    if (StockAiService.toolNames.has(name)) return this.stockTools.execute(userId, name, args);
    if (name === 'list_life_goals') return this.goalTools.execute(userId, name, args);
    throw new Error(`未知的工具：${name}`);
  }

  async ask(params: {
    userId: string;
    apiKey: string;
    question: string;
    previousInteractionId?: string;
    feature: string;
  }): Promise<AskResult> {
    const client = new GoogleGenAI({ apiKey: params.apiKey });
    const startedAt = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      let interaction = await client.interactions.create({
        model: MODEL,
        system_instruction: systemInstruction(),
        tools: TOOLS,
        ...(params.previousInteractionId && {
          previous_interaction_id: params.previousInteractionId,
        }),
        input: params.question,
      });
      totalInputTokens += interaction.usage?.total_input_tokens ?? 0;
      totalOutputTokens += interaction.usage?.total_output_tokens ?? 0;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const callSteps = (interaction.steps ?? []).filter(
          (step): step is typeof step & { type: 'function_call' } => step.type === 'function_call',
        );
        if (callSteps.length === 0) break;

        const results = await Promise.all(
          callSteps.map(async (step) => {
            try {
              const output = await this.runTool(params.userId, step.name, (step.arguments ?? {}) as Record<string, unknown>);
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
                result: [{ type: 'text' as const, text: String(error instanceof Error ? error.message : error) }],
              };
            }
          }),
        );

        interaction = await client.interactions.create({
          model: MODEL,
          tools: TOOLS,
          previous_interaction_id: interaction.id,
          input: results,
        });
        totalInputTokens += interaction.usage?.total_input_tokens ?? 0;
        totalOutputTokens += interaction.usage?.total_output_tokens ?? 0;
      }

      await this.aiUsage.record({
        userId: params.userId,
        feature: params.feature,
        model: MODEL,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });

      return {
        answer: interaction.output_text ?? '（沒有取得回應，請換個方式再問一次。）',
        interactionId: interaction.id,
      };
    } catch (error) {
      this.logger.error('AI assistant interaction failed', error as Error);
      await this.aiUsage.record({
        userId: params.userId,
        feature: params.feature,
        model: MODEL,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
