/** Gemini 額度用完（429）：免費層每個模型分開算（每分鐘幾次、每天幾次），
 * 所以主要模型被擋時可以換另一個模型接著回答。兩個都被擋就丟
 * AiRateLimitedError——這不是系統壞掉，不通知管理員，直接跟使用者說等一下。 */

export class AiRateLimitedError extends Error {
  constructor(
    readonly daily: boolean,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'AiRateLimitedError';
  }
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof AiRateLimitedError) return true;
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate limit|RESOURCE_EXHAUSTED|quota/i.test(message);
}

/** 訊息裡有「per day」/「requests per day」之類就是今天的額度用完了。 */
export function isDailyLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /per day|daily|PerDay/i.test(message);
}

export function rateLimitMessage(error: AiRateLimitedError): string {
  return error.daily
    ? 'AI 今天的免費額度用完了，明天會自動恢復 🙏（固定指令跟按鈕還是可以用）'
    : 'AI 這一分鐘被問太多次了（免費額度有每分鐘上限），等一分鐘再傳一次就好 🙏';
}

/** 先用 primary；額度用完換 fallback。回傳實際用的模型，之後同一輪對話要繼續用它。 */
export async function withModelFallback<T>(
  primary: string,
  fallback: string,
  call: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
  try {
    return { result: await call(primary), model: primary };
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    if (fallback === primary) throw new AiRateLimitedError(isDailyLimit(error), error);
    try {
      return { result: await call(fallback), model: fallback };
    } catch (second) {
      if (!isRateLimitError(second)) throw second;
      throw new AiRateLimitedError(isDailyLimit(error) && isDailyLimit(second), second);
    }
  }
}

/** 備用模型（跟閒聊分流的輕量模型同一個，額度跟主要模型分開算）。 */
export const fallbackModel = () => process.env.AI_CHAT_MODEL || 'gemini-3.5-flash-lite';
