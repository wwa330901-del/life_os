import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiQueryToolsService, AI_QUERY_TOOLS } from './ai-query-tools.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';

const MODEL = GEMINI_MODEL;
const MAX_TOOL_ROUNDS = 5;

const SYSTEM_INSTRUCTION = [
  '你是「元序」App 的個人資料問答助理，使用者會用中文問你關於他自己的記帳、代辦事項、專案、行事曆的問題。',
  '你可以呼叫提供的工具查詢使用者自己的真實資料，回答時盡量根據查到的資料，不要瞎猜數字。',
  '你完全沒有、也不會被賦予任何投資/股票相關的資料查詢工具——如果使用者問投資/股票相關問題，直接說明這個功能目前不提供投資相關的查詢或建議，不要嘗試用其他工具拼湊答案。',
  '你只負責回答問題（問答），不會主動幫使用者新增/修改/刪除任何資料，也沒有這類工具可用。',
  '回覆一律使用繁體中文，簡潔但完整地回答問題。',
].join('\n');

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
  ) {}

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
        system_instruction: SYSTEM_INSTRUCTION,
        tools: AI_QUERY_TOOLS,
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
              const output = await this.tools.execute(params.userId, step.name, step.arguments ?? {});
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
          tools: AI_QUERY_TOOLS,
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
