/** 閒聊分流（2026-10-02）：閒聊、一般問題用輕量 AI（不帶 70 個工具）回答，
 * 要查資料或做事才交給 Agent。兩邊共用一份最近對話紀錄接上下文。純函式。 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** 這輪是誰回的：chat＝輕量 AI，agent＝Agent。 */
  via: 'chat' | 'agent';
  at: string; // ISO
}

const MAX_TURNS = 12;
const MAX_TEXT = 600;

export function parseTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is ChatTurn =>
      t != null &&
      typeof t === 'object' &&
      (t.role === 'user' || t.role === 'assistant') &&
      typeof t.text === 'string' &&
      (t.via === 'chat' || t.via === 'agent') &&
      typeof t.at === 'string',
  );
}

/** 只留對話還有效（windowMs 內）的最近幾輪。 */
export function activeTurns(turns: ChatTurn[], now: Date, windowMs: number): ChatTurn[] {
  const last = turns[turns.length - 1];
  if (!last || now.getTime() - Date.parse(last.at) > windowMs) return [];
  return turns.slice(-MAX_TURNS);
}

export function appendTurns(turns: ChatTurn[], userText: string, reply: string, via: ChatTurn['via'], now: Date): ChatTurn[] {
  const at = now.toISOString();
  return [
    ...turns,
    { role: 'user' as const, text: userText.slice(0, MAX_TEXT), via, at },
    { role: 'assistant' as const, text: reply.slice(0, MAX_TEXT), via, at },
  ].slice(-MAX_TURNS);
}

/** 給輕量 AI 看的最近對話。 */
export function transcript(turns: ChatTurn[]): string {
  return turns.map((t) => `${t.role === 'user' ? '使用者' : '你'}：${t.text}`).join('\n');
}

/** Agent 上一次回覆之後、在閒聊那邊講過的話——Agent 自己的對話串裡沒有，
 * 交給它之前補在訊息前面。 */
export function unsyncedChatTurns(turns: ChatTurn[]): ChatTurn[] {
  let i = turns.length;
  while (i > 0 && turns[i - 1].via === 'chat') i--;
  return turns.slice(i);
}

export function agentInput(text: string, turns: ChatTurn[]): string {
  const missed = unsyncedChatTurns(turns);
  if (missed.length === 0) return text;
  return `（剛剛你們還聊了這些，接著回答：\n${transcript(missed)}）\n\n${text}`;
}
