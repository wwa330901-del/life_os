import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';

const PROMPT = [
  '把這段語音逐字轉成繁體中文文字（台灣用語），只輸出使用者說的話本身，不要加任何說明、引號或標點以外的符號。',
  '數字、金額、日期、時間用阿拉伯數字（例如「一百二十塊」寫成「120元」、「三點半」寫成「3:30」）。',
  '聽不清楚或沒有人說話就只輸出：（聽不清楚）',
].join('\n');

const UNCLEAR = '（聽不清楚）';

/** LINE 語音訊息 → 文字（2026-10-01）。用使用者自己的 Gemini 金鑰；轉出來的
 * 文字交給 LineService 當成使用者打的字處理。 */
@Injectable()
export class VoiceTranscriberService {
  private readonly logger = new Logger(VoiceTranscriberService.name);

  constructor(private readonly aiUsage: AiUsageService) {}

  /** null = 聽不清楚或轉換失敗。 */
  async transcribe(userId: string, apiKey: string, audio: Buffer): Promise<string | null> {
    const startedAt = Date.now();
    try {
      const client = new GoogleGenAI({ apiKey });
      const interaction = await client.interactions.create({
        model: GEMINI_MODEL,
        input: [
          { type: 'text', text: PROMPT },
          { type: 'audio', data: audio.toString('base64'), mime_type: 'audio/m4a' },
        ],
      });
      await this.aiUsage.record({
        userId,
        feature: 'voice',
        model: GEMINI_MODEL,
        inputTokens: interaction.usage?.total_input_tokens ?? 0,
        outputTokens: interaction.usage?.total_output_tokens ?? 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });
      const text = interaction.output_text?.trim().replace(/^「|」$/g, '') ?? '';
      return text && !text.includes(UNCLEAR) ? text : null;
    } catch (error) {
      await this.aiUsage.record({
        userId,
        feature: 'voice',
        model: GEMINI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger.error(`語音轉文字失敗（userId=${userId}）：${String(error)}`);
      return null;
    }
  }
}
