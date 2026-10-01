import { financePlanText, parseFinancePlan } from './finance-plan-format';

const ctx = {
  monthlyIncome: 60000,
  budgetableCategories: ['餐飲', '交通', '購物'],
  categoryAverages: [
    { name: '餐飲', monthlyAverage: 12000 },
    { name: '購物', monthlyAverage: 8000 },
  ],
};

describe('parseFinancePlan', () => {
  it('keeps valid budgets, rounds to 100, attaches the current average', () => {
    const p = parseFinancePlan(
      JSON.stringify({
        summary: '每月大約能存 1.5 萬',
        allocation: [
          { name: '固定支出', amount: 18000, percent: 30, reason: '房租' },
          { name: '儲蓄', amount: 0, percent: 0, reason: '' },
        ],
        budgets: [
          { category: '餐飲', amount: 10450, reason: '少外食' },
          { category: '不存在的分類', amount: 3000, reason: '' },
          { category: '餐飲', amount: 9000, reason: '重複' },
          { category: '購物', amount: -5, reason: '' },
        ],
        steps: ['先存預備金', '', '設定定期定額'],
      }),
      ctx,
    );
    expect(p.allocation.map((a) => a.name)).toEqual(['固定支出']);
    expect(p.budgets).toEqual([{ category: '餐飲', amount: 10500, reason: '少外食', currentAverage: 12000 }]);
    expect(p.steps).toEqual(['先存預備金', '設定定期定額']);
    expect(p.wishlistAdvice).toBeNull();
  });

  it('formats for LINE', () => {
    const p = parseFinancePlan(
      JSON.stringify({
        summary: '狀況不錯',
        allocation: [{ name: '儲蓄', amount: 12000, percent: 20, reason: '先存預備金' }],
        budgets: [{ category: '餐飲', amount: 10000, reason: '' }],
        steps: ['存到 18 萬預備金'],
        wishlistAdvice: 'AirPods 可以 11 月買',
      }),
      ctx,
    );
    const text = financePlanText(p);
    expect(text).toContain('・儲蓄 12,000（20%）：先存預備金');
    expect(text).toContain('・餐飲 10,000（現在平均 12,000）');
    expect(text).toContain('【購物車】\nAirPods 可以 11 月買');
    expect(text).toContain('1. 存到 18 萬預備金');
  });
});
