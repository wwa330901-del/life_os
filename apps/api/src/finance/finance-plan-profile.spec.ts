import { mergeFinancePlanProfile, parseFinancePlanProfile } from './finance-plan-profile';

describe('財務規劃問卷', () => {
  const now = new Date('2026-10-07T00:00:00Z');

  it('清掉空白、負數的支出，金額取整數', () => {
    const p = mergeFinancePlanProfile(
      null,
      { monthlyIncome: 52000.4, fixedExpenses: [{ name: ' 房租 ', amount: 12000 }, { name: '', amount: 5 }, { name: '保險', amount: -1 }], thoughts: '  想存頭期款 ' },
      now,
    );
    expect(p).toEqual({ monthlyIncome: 52000, fixedExpenses: [{ name: '房租', amount: 12000 }], thoughts: '想存頭期款', updatedAt: now.toISOString() });
  });

  it('沒帶的欄位保留上次的，帶 null 就清掉', () => {
    const prev = mergeFinancePlanProfile(null, { monthlyIncome: 50000, fixedExpenses: [{ name: '房租', amount: 12000 }], thoughts: '存錢' }, now);
    expect(mergeFinancePlanProfile(prev, { thoughts: '想去日本' }, now)).toMatchObject({ monthlyIncome: 50000, fixedExpenses: [{ name: '房租', amount: 12000 }], thoughts: '想去日本' });
    expect(mergeFinancePlanProfile(prev, { monthlyIncome: null }, now).monthlyIncome).toBeNull();
  });

  it('沒存過是 null', () => {
    expect(parseFinancePlanProfile(null)).toBeNull();
    expect(parseFinancePlanProfile({ monthlyIncome: 40000 })?.monthlyIncome).toBe(40000);
  });
});
