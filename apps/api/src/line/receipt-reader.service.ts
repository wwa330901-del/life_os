import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';

export interface Receipt {
  merchant: string | null;
  total: number;
  date: string | null; // YYYY-MM-DD
  items: string | null;
  paymentMethod: string | null;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    isReceipt: { type: 'boolean' },
    merchant: { type: 'string' },
    total: { type: 'number' },
    date: { type: 'string' },
    items: { type: 'string' },
    paymentMethod: { type: 'string' },
  },
  required: ['isReceipt'],
};

const PROMPT = [
  '判斷這張照片是不是「一筆消費的單據」：收據、統一發票、電子發票證明聯、刷卡簽單、POS 明細、外送或網購訂單畫面、繳費單收據都算；菜單、價目表、商品照片、風景、文章截圖都不算。',
  '是的話 isReceipt=true，並填：',
  '- merchant：店家名稱',
  '- total：實際付款總金額（數字，新台幣；有折扣用折扣後的）',
  '- date：消費日期 YYYY-MM-DD（民國年要換成西元，例如 115 年＝2026 年；看不到就不填）',
  '- items：買了什麼，最多三樣，用頓號隔開（例如「拿鐵、可頌」）',
  '- paymentMethod：看得出來才填（現金／信用卡／悠遊卡／Line Pay 等）',
  '不是的話 isReceipt=false，其他都不填。一律繁體中文。',
].join('\n');

/** 拍收據記帳（2026-10-01）：LINE 收到的照片先問 Gemini 是不是單據，是的
 * 話讀出金額店家，交給萬用 AI 照原本的記帳流程（猜帳戶→問確認）；不是就
 * 照舊進知識庫。 */
@Injectable()
export class ReceiptReaderService {
  private readonly logger = new Logger(ReceiptReaderService.name);

  constructor(private readonly aiUsage: AiUsageService) {}

  /** null = 不是單據，或看不出金額，或判斷失敗（照舊進知識庫）。 */
  async read(userId: string, apiKey: string, image: Buffer, mimeType = 'image/jpeg'): Promise<Receipt | null> {
    const startedAt = Date.now();
    try {
      const client = new GoogleGenAI({ apiKey });
      const interaction = await client.interactions.create({
        model: GEMINI_MODEL,
        input: [
          { type: 'text', text: PROMPT },
          { type: 'image', data: image.toString('base64'), mime_type: mimeType },
        ],
        response_format: { type: 'text', mime_type: 'application/json', schema: RESPONSE_SCHEMA },
      });
      await this.aiUsage.record({
        userId,
        feature: 'receipt',
        model: GEMINI_MODEL,
        inputTokens: interaction.usage?.total_input_tokens ?? 0,
        outputTokens: interaction.usage?.total_output_tokens ?? 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });
      return parseReceipt(interaction.output_text);
    } catch (error) {
      await this.aiUsage.record({
        userId,
        feature: 'receipt',
        model: GEMINI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(`收據判斷失敗，照舊進知識庫（userId=${userId}）：${String(error)}`);
      return null;
    }
  }
}

export function parseReceipt(outputText: string | undefined): Receipt | null {
  if (!outputText) return null;
  const raw = JSON.parse(outputText) as Record<string, unknown>;
  const total = Number(raw.total);
  if (raw.isReceipt !== true || !Number.isFinite(total) || total <= 0) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const date = str(raw.date);
  return {
    merchant: str(raw.merchant),
    total: Math.round(total),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    items: str(raw.items),
    paymentMethod: str(raw.paymentMethod),
  };
}

/** What the 萬用 AI is told — it then records it through its normal
 * record_transaction rules (category from the user's own list, account
 * guessed and confirmed). */
export function receiptToAgentText(r: Receipt): string {
  return [
    '我拍了一張收據，幫我記一筆支出：',
    `金額 ${r.total} 元`,
    r.merchant ? `店家：${r.merchant}` : null,
    r.items ? `買了：${r.items}` : null,
    r.date ? `日期：${r.date}` : null,
    r.paymentMethod
      ? `收據上的付款方式：${r.paymentMethod}（不要直接填帳戶，先照猜的帳戶問我確認，並提到收據上寫的付款方式）`
      : null,
    '備註寫店家和買了什麼。',
  ]
    .filter((line) => line !== null)
    .join('\n');
}
