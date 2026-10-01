import { activeTurns, agentInput, appendTurns, parseTurns, transcript, unsyncedChatTurns, type ChatTurn } from './chat-router';

const now = new Date('2026-10-02T10:00:00Z');

describe('chat router turns', () => {
  it('appends user + reply and keeps the last 12', () => {
    let turns: ChatTurn[] = [];
    for (let i = 0; i < 8; i++) turns = appendTurns(turns, `問${i}`, `答${i}`, 'chat', now);
    expect(turns).toHaveLength(12);
    expect(turns[0].text).toBe('問2');
    expect(transcript(turns.slice(-2))).toBe('使用者：問7\n你：答7');
  });

  it('drops the whole history once the conversation went quiet', () => {
    const turns = appendTurns([], '你好', '嗨', 'chat', new Date('2026-10-02T09:00:00Z'));
    expect(activeTurns(turns, now, 10 * 60 * 1000)).toEqual([]);
    expect(activeTurns(turns, now, 2 * 60 * 60 * 1000)).toHaveLength(2);
  });

  it('tells the agent only what was said in chat since its own last reply', () => {
    let turns = appendTurns([], '午餐 120', '記好了', 'agent', now);
    expect(unsyncedChatTurns(turns)).toEqual([]);
    expect(agentInput('改成 150', turns)).toBe('改成 150');
    turns = appendTurns(turns, '今天好累', '辛苦了', 'chat', now);
    expect(unsyncedChatTurns(turns).map((t) => t.text)).toEqual(['今天好累', '辛苦了']);
    expect(agentInput('幫我排明天早點睡', turns)).toContain('使用者：今天好累\n你：辛苦了');
  });

  it('ignores malformed stored data', () => {
    expect(parseTurns(null)).toEqual([]);
    expect(parseTurns([{ role: 'x' }, { role: 'user', text: 'a', via: 'chat', at: now.toISOString() }])).toHaveLength(1);
  });
});
