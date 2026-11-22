import { notUnderstoodMessage } from './line-shared';

describe('notUnderstoodMessage', () => {
  it('短短一句＋選項按鈕（LINE 快速回覆 label 最多 20 字）', () => {
    const msg = notUnderstoodMessage('asdfgh') as { text: string; quickReply: { items: { action: { label: string; text: string } }[] } };
    expect(msg.text).toContain('我沒看懂「asdfgh」');
    expect(msg.quickReply.items.length).toBeGreaterThanOrEqual(3);
    for (const item of msg.quickReply.items) expect(item.action.label.length).toBeLessThanOrEqual(20);
    expect(msg.quickReply.items[0].action.text).toBe('我能做什麼');
  });

  it('太長的訊息只顯示前 20 字', () => {
    const msg = notUnderstoodMessage('一'.repeat(40)) as { text: string };
    expect(msg.text).toContain(`「${'一'.repeat(20)}…」`);
  });
});
