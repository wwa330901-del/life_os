import { computeFinanceHealth, HealthInputs } from './finance-health';

const healthy: HealthInputs = {
  income3m: 150000,
  expense3m: 90000, // 40% savings
  liquid: 200000, // 6.7 months
  totalAssets: 800000,
  debt: 0,
  netWorth: 800000,
  budgetCount: 3,
  budgetsWithin: 3,
  investedValue: 400000, // 50%
  largestHolding: 150000,
  recordedDays30: 25,
};

describe('computeFinanceHealth', () => {
  it('gives full marks to a healthy profile', () => {
    const r = computeFinanceHealth(healthy);
    expect(r.total).toBe(100);
    expect(r.grade).toBe('優秀');
    expect(r.items.every((i) => i.tip === null)).toBe(true);
  });

  it('scores each weakness proportionally and explains it', () => {
    const r = computeFinanceHealth({
      ...healthy,
      expense3m: 135000, // 10% savings → 25 * (0.1/0.3)
      liquid: 90000, // 2 months → 20 * (2/6)
      debt: 200000, // 25% of assets → 15 * 0.5
      budgetsWithin: 1, // 1/3 → 5
      largestHolding: 300000, // 75% concentration
      recordedDays30: 5, // → 2.5
    });
    const byKey = Object.fromEntries(r.items.map((i) => [i.key, i]));
    expect(byKey.savings.score).toBe(8.3);
    expect(byKey.savings.tip).toContain('每月再少花或多存約 10,000 元');
    expect(byKey.emergency.score).toBe(6.7);
    expect(byKey.emergency.detail).toBe('現金＋存款可以撐 2 個月');
    expect(byKey.debt.score).toBe(7.5);
    expect(byKey.budget.score).toBe(5);
    expect(byKey.invest.tip).toContain('最大一檔佔持股 75%');
    expect(byKey.habit.score).toBe(2.5);
    expect(r.grade).toBe('需要加強');
  });

  it('handles missing data without dividing by zero', () => {
    const r = computeFinanceHealth({
      income3m: 0,
      expense3m: 0,
      liquid: 0,
      totalAssets: 0,
      debt: 0,
      netWorth: 0,
      budgetCount: 0,
      budgetsWithin: 0,
      investedValue: 0,
      largestHolding: 0,
      recordedDays30: 0,
    });
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.items.find((i) => i.key === 'savings')!.detail).toBe('近 3 個月沒有記到收入');
  });
});
