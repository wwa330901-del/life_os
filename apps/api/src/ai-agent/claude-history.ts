import type Anthropic from '@anthropic-ai/sdk';

/** Claude Agent 的對話紀錄（2026-10-02）。Gemini 的 Interactions API 在伺服器記
 * 對話（previous_interaction_id）；Claude 是無狀態的，要自己存 messages、下一則
 * 訊息整段送回去。純函式。
 *
 * 跨訊息時把思考區塊拿掉：系統提示每則訊息都會變（現在時間、等確認的動作），
 * 帶著舊的思考區塊送回去會被 API 拒絕（preserved thinking 的歷史檢查）；
 * 全部拿掉是允許的，而且對話內容、工具呼叫和結果都還在。 */

/** 最多保留最近幾輪「使用者講的話」（每輪含中間的工具呼叫）。 */
const MAX_USER_TURNS = 6;
/** 存起來的工具結果太長就截斷（查詢結果可能很大）。 */
const MAX_TOOL_RESULT_CHARS = 3000;
/** 整段紀錄的上限（字元），超過就再丟掉最舊的一輪。 */
const MAX_TOTAL_CHARS = 60_000;

type Block = Anthropic.ContentBlockParam;

export function parseHistory(raw: unknown): Anthropic.MessageParam[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is Anthropic.MessageParam =>
      m != null &&
      typeof m === 'object' &&
      ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant') &&
      (typeof (m as { content?: unknown }).content === 'string' || Array.isArray((m as { content?: unknown }).content)),
  );
}

const isThinking = (b: Block) => b.type === 'thinking' || b.type === 'redacted_thinking';
const blocksOf = (m: Anthropic.MessageParam): Block[] => (typeof m.content === 'string' ? [] : m.content);

/** 使用者自己講的話（不是工具結果）——一輪對話從這裡開始。 */
function isUserTurnStart(m: Anthropic.MessageParam): boolean {
  if (m.role !== 'user') return false;
  return typeof m.content === 'string' || !m.content.some((b) => b.type === 'tool_result');
}

/** 送給下一則訊息前：拿掉思考區塊，拿掉後變空的 assistant 訊息整則丟掉。 */
export function forNextTurn(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant' || typeof m.content === 'string') {
      out.push(m);
      continue;
    }
    const content = m.content.filter((b) => !isThinking(b));
    if (content.length > 0) out.push({ role: 'assistant', content });
  }
  return out;
}

function truncateToolResults(m: Anthropic.MessageParam): Anthropic.MessageParam {
  if (m.role !== 'user' || typeof m.content === 'string') return m;
  return {
    role: 'user',
    content: m.content.map((b) => {
      if (b.type !== 'tool_result' || typeof b.content !== 'string' || b.content.length <= MAX_TOOL_RESULT_CHARS) return b;
      return { ...b, content: `${b.content.slice(0, MAX_TOOL_RESULT_CHARS)}…（太長，後面省略）` };
    }),
  };
}

/** 要存進資料庫的版本：去掉沒收尾的工具呼叫、思考區塊，截斷大的工具結果，只留最近幾輪。 */
export function historyForStorage(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  let list = forNextTurn(messages).map(truncateToolResults);
  // 最後一則是還沒拿到結果的工具呼叫（工具輪數用完）→ 下次送回去會被拒絕，丟掉。
  while (list.length > 0) {
    const last = list[list.length - 1];
    if (last.role === 'assistant' && blocksOf(last).some((b) => b.type === 'tool_use')) list = list.slice(0, -1);
    else break;
  }
  const starts = list.map((m, i) => (isUserTurnStart(m) ? i : -1)).filter((i) => i >= 0);
  let keepFrom = starts.length > MAX_USER_TURNS ? starts[starts.length - MAX_USER_TURNS] : (starts[0] ?? list.length);
  let kept = list.slice(keepFrom);
  for (let s = starts.indexOf(keepFrom) + 1; JSON.stringify(kept).length > MAX_TOTAL_CHARS && s < starts.length; s++) {
    keepFrom = starts[s];
    kept = list.slice(keepFrom);
  }
  return JSON.stringify(kept).length > MAX_TOTAL_CHARS ? [] : kept;
}
