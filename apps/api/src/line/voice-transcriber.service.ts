import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';
import { geminiUnavailable } from '../ai/ai-errors';

const PROMPT = [
  '把這段語音逐字轉成繁體中文文字（台灣用語），只輸出使用者說的話本身，不要加任何說明、引號或標點以外的符號。',
  '數字、金額、日期、時間用阿拉伯數字（例如「一百二十塊」寫成「120元」、「三點半」寫成「3:30」）。',
  '聽不清楚或沒有人說話就只輸出：（聽不清楚）',
].join('\n');

const UNCLEAR = '（聽不清楚）';

/** 輕量模型有時會在中文字之間加空格（「午 餐 吃 拉 麵」），拿掉；英文單字間的空格保留。 */
export function tidyTranscript(raw: string): string {
  return raw
    .trim()
    .replace(/^「|」$/g, '')
    .replace(/([\u3000-\u9fff\uff00-\uffef])\s+(?=[\u3000-\u9fff\uff00-\uffef\d])/g, '$1')
    .replace(/(\d)\s+(?=[\u3000-\u9fff\uff00-\uffef])/g, '$1');
}

/** LINE 語音訊息 → 文字（2026-10-01）。用使用者自己的 Gemini 金鑰；轉出來的
 * 文字交給 LineService 當成使用者打的字處理。2026-10-02 AI 改用 Claude 後，
 * Gemini 只剩這裡和看影片（Claude 聽不到聲音）——先用輕量模型（免費額度多），
 * 它失敗再換一般模型。 */
const VOICE_MODELS = () => [process.env.GEMINI_VOICE_MODEL || 'gemini-3.5-flash-lite', GEMINI_MODEL];

@Injectable()
export class VoiceTranscriberService {
  private readonly logger = new Logger(VoiceTranscriberService.name);

  constructor(private readonly aiUsage: AiUsageService) {}

  /** null = 聽不清楚或轉換失敗；金鑰／額度／付款問題丟 AiUnavailableError（呼叫端跟使用者說原因）。 */
  async transcribe(userId: string, apiKey: string, audio: Buffer): Promise<string | null> {
    const client = new GoogleGenAI({ apiKey });
    let lastError: unknown = null;
    for (const model of VOICE_MODELS()) {
      const startedAt = Date.now();
      try {
        const interaction = await client.interactions.create({
          model,
          input: [
            { type: 'text', text: PROMPT },
            { type: 'audio', data: audio.toString('base64'), mime_type: 'audio/m4a' },
          ],
        });
        await this.aiUsage.record({
          userId,
          feature: 'voice',
          model,
          inputTokens: interaction.usage?.total_input_tokens ?? 0,
          outputTokens: interaction.usage?.total_output_tokens ?? 0,
          durationMs: Date.now() - startedAt,
          status: AiUsageStatus.SUCCESS,
        });
        const text = tidyTranscript(interaction.output_text ?? '');
        return text && !text.includes(UNCLEAR) ? text : null;
      } catch (error) {
        lastError = error;
        await this.aiUsage.record({
          userId,
          feature: 'voice',
          model,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - startedAt,
          status: AiUsageStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        const unavailable = geminiUnavailable(error);
        // 金鑰或付款問題換模型也一樣；額度／忙線換模型可能就好了。
        if (unavailable && (unavailable.reason === 'invalid_key' || unavailable.reason === 'billing')) throw unavailable;
      }
    }
    const unavailable = geminiUnavailable(lastError);
    if (unavailable) throw unavailable;
    this.logger.error(`語音轉文字失敗（userId=${userId}）：${String(lastError)}`);
    return null;
  }
}
