/** Gemini 額度用完（429）：免費層每個模型分開算（每分鐘幾次、每天幾次），
 * 所以主要模型被擋時可以換另一個模型接著回答。兩個都被擋就丟
 * AiRateLimitedError——這不是系統壞掉，不通知管理員，直接跟使用者說等一下。
 *
 * 付款有問題（402：預付餘額用完、帳單沒設好）也丟 AiRateLimitedError（reason
 * billing）：同一把金鑰換模型也沒用，要使用者自己到 AI Studio 處理。 */

export type AiLimitReason = 'minute' | 'daily' | 'billing';

export class AiRateLimitedError extends Error {
  constructor(
    readonly reason: AiLimitReason,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'AiRateLimitedError';
  }

  get daily(): boolean {
    return this.reason === 'daily';
  }
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof AiRateLimitedError) return true;
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate limit|RESOURCE_EXHAUSTED|quota/i.test(message);
}

/** 402 Payment Required：金鑰的帳單／預付餘額有問題。 */
export function isBillingError(error: unknown): boolean {
  if (error instanceof AiRateLimitedError) return error.reason === 'billing';
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 402) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b402\b|payment required/i.test(message);
}

/** 訊息裡有「per day」/「requests per day」之類就是今天的額度用完了。 */
export function isDailyLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /per day|daily|PerDay/i.test(message);
}

export const BILLING_MESSAGE =
  'AI 現在不能用：你的 Gemini 金鑰付款有問題（預付餘額用完，或帳單還沒設定好）。請到 Google AI Studio（aistudio.google.com）左邊的「Billing／帳單」儲值或檢查付款方式，弄好馬上就能用 🙏（固定指令跟按鈕還是可以用）';

export function rateLimitMessage(error: AiRateLimitedError): string {
  if (error.reason === 'billing') return BILLING_MESSAGE;
  return error.daily
    ? 'AI 今天的免費額度用完了，明天會自動恢復 🙏（固定指令跟按鈕還是可以用）'
    : 'AI 這一分鐘被問太多次了（免費額度有每分鐘上限），等一分鐘再傳一次就好 🙏';
}

/** 先用 primary；額度用完換 fallback。回傳實際用的模型，之後同一輪對話要繼續用它。
 * 付款問題換模型也沒用，直接丟。 */
export async function withModelFallback<T>(
  primary: string,
  fallback: string,
  call: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
  try {
    return { result: await call(primary), model: primary };
  } catch (error) {
    if (isBillingError(error)) throw new AiRateLimitedError('billing', error);
    if (!isRateLimitError(error)) throw error;
    if (fallback === primary) throw new AiRateLimitedError(isDailyLimit(error) ? 'daily' : 'minute', error);
    try {
      return { result: await call(fallback), model: fallback };
    } catch (second) {
      if (isBillingError(second)) throw new AiRateLimitedError('billing', second);
      if (!isRateLimitError(second)) throw second;
      throw new AiRateLimitedError(isDailyLimit(error) && isDailyLimit(second) ? 'daily' : 'minute', second);
    }
  }
}

/** 備用模型（跟閒聊分流的輕量模型同一個，額度跟主要模型分開算）。 */
export const fallbackModel = () => process.env.AI_CHAT_MODEL || 'gemini-3.5-flash-lite';
