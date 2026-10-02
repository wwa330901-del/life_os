import Anthropic from '@anthropic-ai/sdk';

/** AI 暫時不能用、但不是元序壞掉的情況（2026-10-02 改成 Claude 為主，Gemini
 * 只剩語音轉文字、看影片）：額度用完、帳戶沒錢、金鑰無效、伺服器太忙。
 * 這些丟 AiUnavailableError——不通知管理員，呼叫端直接跟使用者說原因。 */

export type AiProvider = 'claude' | 'gemini';
export type AiUnavailableReason = 'minute' | 'daily' | 'billing' | 'invalid_key' | 'busy';

export class AiUnavailableError extends Error {
  constructor(
    readonly reason: AiUnavailableReason,
    readonly provider: AiProvider,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'AiUnavailableError';
  }
}

const statusOf = (error: unknown) => (error as { status?: unknown } | null)?.status;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Claude 的錯誤 → AiUnavailableError；其他錯誤（真的壞掉）回 null。SDK 已經自己重試過 429/5xx。 */
export function claudeUnavailable(error: unknown): AiUnavailableError | null {
  if (error instanceof AiUnavailableError) return error;
  if (!(error instanceof Anthropic.APIError)) return null;
  const reason: AiUnavailableReason | null =
    error.status === 402 || error.type === 'billing_error' || /credit balance/i.test(error.message)
      ? 'billing'
      : error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError
        ? 'invalid_key'
        : error instanceof Anthropic.RateLimitError
          ? 'minute'
          : error.status === 529 || error.type === 'overloaded_error' || (error.status ?? 0) >= 500
            ? 'busy'
            : null;
  return reason && new AiUnavailableError(reason, 'claude', error);
}

/** Gemini（語音、影片）的錯誤 → AiUnavailableError；其他回 null。 */
export function geminiUnavailable(error: unknown): AiUnavailableError | null {
  if (error instanceof AiUnavailableError) return error;
  const status = statusOf(error);
  const message = messageOf(error);
  if (status === 402 || /\b402\b|payment required/i.test(message)) return new AiUnavailableError('billing', 'gemini', error);
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID/i.test(message)) {
    return new AiUnavailableError('invalid_key', 'gemini', error);
  }
  if (status === 429 || /\b429\b|rate limit|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new AiUnavailableError(/per day|daily|PerDay/i.test(message) ? 'daily' : 'minute', 'gemini', error);
  }
  if (status === 503 || /\b503\b|overloaded|UNAVAILABLE/i.test(message)) return new AiUnavailableError('busy', 'gemini', error);
  return null;
}

/** 金鑰付款問題（給錯誤通報加說明用）。 */
export function isBillingError(error: unknown): boolean {
  if (error instanceof AiUnavailableError) return error.reason === 'billing';
  if (error instanceof Anthropic.APIError) return claudeUnavailable(error)?.reason === 'billing';
  return /\b402\b|payment required|billing_error|credit balance/i.test(messageOf(error));
}

const NAME: Record<AiProvider, string> = { claude: 'Claude', gemini: 'Gemini' };
const BILLING_WHERE: Record<AiProvider, string> = {
  claude: 'console.anthropic.com 左邊的「Billing」儲值',
  gemini: 'aistudio.google.com 檢查帳單／付款方式',
};
const STILL_WORKS = '（固定指令跟按鈕還是可以用）';

export function aiUnavailableMessage(error: AiUnavailableError): string {
  const name = NAME[error.provider];
  switch (error.reason) {
    case 'billing':
      return `AI 現在不能用：${name} 帳戶的錢用完了（或還沒儲值、付款方式有問題）。請到 ${BILLING_WHERE[error.provider]}，弄好馬上就能用 🙏${STILL_WORKS}`;
    case 'invalid_key':
      return `AI 現在不能用：${name} 金鑰無效（可能貼錯或被刪掉了）。請到 App 左側「AI 設定」重新貼上 🙏${STILL_WORKS}`;
    case 'daily':
      return `${name} 今天的額度用完了，明天會自動恢復 🙏${STILL_WORKS}`;
    case 'busy':
      return `${name} 現在太忙（伺服器過載），過幾分鐘再試一次 🙏`;
    default:
      return `AI 這一分鐘被問太多次了，等一分鐘再傳一次就好 🙏`;
  }
}
