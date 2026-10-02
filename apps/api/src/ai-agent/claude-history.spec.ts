import type Anthropic from '@anthropic-ai/sdk';
import { forNextTurn, historyForStorage, parseHistory } from './claude-history';

const user = (text: string): Anthropic.MessageParam => ({ role: 'user', content: text });
const thinking = { type: 'thinking' as const, thinking: '', signature: 'sig' };
const toolUse = (id: string): Anthropic.MessageParam => ({
  role: 'assistant',
  content: [thinking, { type: 'tool_use', id, name: 'list_todos', input: {} }],
});
const toolResult = (id: string, content = '[]'): Anthropic.MessageParam => ({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: id, content }],
});
const reply = (text: string): Anthropic.MessageParam => ({ role: 'assistant', content: [thinking, { type: 'text', text }] });

describe('claude-history', () => {
  it('跨訊息前拿掉思考區塊，只剩思考的 assistant 整則丟掉', () => {
    const out = forNextTurn([user('a'), { role: 'assistant', content: [thinking] }, user('b'), reply('ok')]);
    expect(out).toEqual([user('a'), user('b'), { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }]);
  });

  it('存起來時去掉沒拿到結果的工具呼叫', () => {
    const out = historyForStorage([user('a'), toolUse('t1')]);
    expect(out).toEqual([user('a')]);
  });

  it('只留最近 6 輪，而且從使用者講的話開始（不會從工具結果開始）', () => {
    const messages: Anthropic.MessageParam[] = [];
    for (let i = 0; i < 8; i++) messages.push(user(`q${i}`), toolUse(`t${i}`), toolResult(`t${i}`), reply(`r${i}`));
    const out = historyForStorage(messages);
    expect(out[0]).toEqual(user('q2'));
    expect(out.filter((m) => typeof m.content === 'string')).toHaveLength(6);
  });

  it('工具結果太長會截斷', () => {
    const out = historyForStorage([user('a'), toolUse('t1'), toolResult('t1', 'x'.repeat(5000)), reply('ok')]);
    const result = (out[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect((result.content as string).length).toBeLessThan(3100);
  });

  it('parseHistory 擋掉壞資料', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory([{ role: 'x', content: 'a' }, user('ok')])).toEqual([user('ok')]);
  });
});
