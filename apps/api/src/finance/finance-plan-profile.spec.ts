import { mergeFinancePlanProfile, parseFinancePlanProfile, profileForPrompt } from './finance-plan-profile';

describe('財務規劃問卷', () => {
  const now = new Date('2026-10-07T00:00:00Z');

  it('清掉空白、負數的項目，金額取整數，選項只收認得的', () => {
    const p = mergeFinancePlanProfile(
      null,
      {
        monthlyIncome: 52000.4,
        payDay: 40,
        fixedExpenses: [{ name: ' 房租 ', amount: 12000 }, { name: '', amount: 5 }, { name: '保險', amount: -1 }],
        annualExpenses: [{ name: '牌照稅', amount: '7,120', month: 4 }, { name: '紅包', amount: 20000, month: 13 }],
        riskProfile: 'yolo',
        priorities: ['goals', 'debt', 'goals', 'nope'],
        goals: [{ name: '日本', amount: 60000, targetMonth: '2027-03', term: 'short' }, { name: '車', amount: 0 }],
        thoughts: '  想存頭期款 ',
      },
      now,
    );
    expect(p.monthlyIncome).toBe(52000);
    expect(p.payDay).toBeNull();
    expect(p.fixedExpenses).toEqual([{ name: '房租', amount: 12000 }]);
    expect(p.annualExpenses).toEqual([{ name: '牌照稅', amount: 7120, month: 4 }, { name: '紅包', amount: 20000, month: null }]);
    expect(p.riskProfile).toBeNull();
    expect(p.priorities).toEqual(['goals', 'debt']);
    expect(p.goals).toEqual([{ name: '日本', amount: 60000, targetMonth: '2027-03', term: 'short' }]);
    expect(p.thoughts).toBe('想存頭期款');
  });

  it('沒帶的欄位保留上次的，帶 null 就清掉', () => {
    const prev = mergeFinancePlanProfile(null, { monthlyIncome: 50000, fixedExpenses: [{ name: '房租', amount: 12000 }], thoughts: '存錢' }, now);
    expect(mergeFinancePlanProfile(prev, { thoughts: '想去日本' }, now)).toMatchObject({ monthlyIncome: 50000, fixedExpenses: [{ name: '房租', amount: 12000 }], thoughts: '想去日本' });
    expect(mergeFinancePlanProfile(prev, { monthlyIncome: null }, now).monthlyIncome).toBeNull();
  });

  it('舊格式（只有收入、固定支出、想法）讀得進來，新欄位是空的', () => {
    expect(parseFinancePlanProfile(null)).toBeNull();
    const old = parseFinancePlanProfile({ monthlyIncome: 40000, fixedExpenses: [{ name: '房租', amount: 1 }], thoughts: 'x' })!;
    expect(old).toMatchObject({ monthlyIncome: 40000, goals: [], annualExpenses: [], riskProfile: null });
  });

  it('給 AI 的整理是中文、有合計', () => {
    const p = mergeFinancePlanProfile(null, { annualExpenses: [{ name: '牌照稅', amount: 7120, month: 4 }], riskProfile: 'none', priorities: ['debt'] }, now);
    const text = profileForPrompt(p);
    expect(text).toContain('牌照稅 7,120（4 月）');
    expect(text).toContain('先不投資');
    expect(text).toContain('優先順序（前面最重要）：還債');
  });
});
