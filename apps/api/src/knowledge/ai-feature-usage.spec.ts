import { summarizeFeatureUsage } from './ai-feature-usage';

describe('summarizeFeatureUsage', () => {
  it('groups tool calls and direct AI calls by feature and lists unused features', () => {
    const at = new Date('2026-10-13T02:00:00Z');
    const later = new Date('2026-10-13T05:00:00Z');
    const { features, unused } = summarizeFeatureUsage(
      [
        { tool: 'record_transaction', count: 5, lastUsedAt: at },
        { tool: 'list_account_balances', count: 2, lastUsedAt: later },
        { tool: 'confirm_pending_action', count: 1, lastUsedAt: at },
        { tool: 'some_new_tool', count: 1, lastUsedAt: at },
      ],
      [
        { feature: 'knowledge', count: 3, lastUsedAt: at },
        { feature: 'line_ai_agent', count: 9, lastUsedAt: at },
      ],
    );

    const finance = features.find((f) => f.feature === '記帳')!;
    expect(finance.count).toBe(7);
    expect(finance.lastUsedAt).toEqual(later);
    expect(finance.tools[0]).toEqual({ tool: 'record_transaction', label: '記一筆收支', count: 5 });
    expect(features[0].feature).toBe('記帳');
    expect(features.find((f) => f.feature === '知識庫')!.count).toBe(3);
    expect(features.find((f) => f.feature === '其他')!.tools).toEqual([{ tool: 'some_new_tool', label: 'some_new_tool', count: 1 }]);
    // 對話本身（line_ai_agent）不算成一個功能。
    expect(features.some((f) => f.feature === 'line_ai_agent')).toBe(false);

    expect(unused).toContain('算命');
    expect(unused).toContain('旅行');
    expect(unused).not.toContain('記帳');
    expect(unused).not.toContain('閒聊');
    expect(unused).not.toContain('確認／取消');
  });
});
