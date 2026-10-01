import { goalPlanText, parseGoalPlan } from './life-goal-plan.service';

describe('parseGoalPlan', () => {
  it('keeps a valid saving plan', () => {
    const p = parseGoalPlan(
      JSON.stringify({
        title: '年底前存到 50 萬',
        category: '存錢',
        trackingType: 'ACCOUNT_BALANCE',
        trackingAccountName: '台新',
        targetValue: 500000,
        unit: '元',
        targetDate: '2026-12-31',
        checkInPeriod: 'TOTAL',
        feasibility: '每月要存 1.6 萬，你平均結餘 1.5 萬，稍微緊。',
        monthlyNeeded: 16000.4,
        milestones: [{ date: '2026-11-01', text: '存到 20 萬' }, { date: 'bad', text: 'x' }],
        weeklyActions: ['每週檢查外食花費', ''],
      }),
      ['台新', '現金'],
    );
    expect(p).toMatchObject({ trackingType: 'ACCOUNT_BALANCE', trackingAccountName: '台新', monthlyNeeded: 16000, targetDate: '2026-12-31' });
    expect(p.milestones).toEqual([{ date: '2026-11-01', text: '存到 20 萬' }]);
    expect(p.weeklyActions).toEqual(['每週檢查外食花費']);
    expect(goalPlanText(p)).toContain('每月要存：16,000 元');
  });

  it('falls back to MANUAL when the suggested account does not exist', () => {
    const p = parseGoalPlan(JSON.stringify({ title: 'x', trackingType: 'ACCOUNT_BALANCE', trackingAccountName: '不存在', checkInPeriod: 'X', feasibility: '', milestones: [], weeklyActions: [] }), ['現金']);
    expect(p.trackingType).toBe('MANUAL');
    expect(p.trackingAccountName).toBeNull();
    expect(p.checkInPeriod).toBe('TOTAL');
  });
});
