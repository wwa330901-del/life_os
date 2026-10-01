import { categorySpikes, largeExpenseThreshold, median, spendingAlertText } from './spending-alerts';

describe('spending alerts', () => {
  it('flags a category 50%+ and 1000+ over its 3-month average', () => {
    const spikes = categorySpikes([
      { categoryId: 'a', name: '外食', monthToDate: 9000, previousMonths: [5000, 6000, 4000] }, // avg 5000, +4000
      { categoryId: 'b', name: '交通', monthToDate: 1400, previousMonths: [800, 800, 800] }, // +75% but only +600
      { categoryId: 'c', name: '購物', monthToDate: 7000, previousMonths: [5000, 5000, 5000] }, // +40%
      { categoryId: 'd', name: '新分類', monthToDate: 9000, previousMonths: [0, 0, 0] }, // no baseline
    ]);
    expect(spikes.map((s) => s.name)).toEqual(['外食']);
    expect(spikes[0].average).toBe(5000);
  });

  it('large expense threshold uses the median, with floors', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(largeExpenseThreshold(Array(12).fill(150))).toBe(3000); // 3×150 < 3000 floor
    expect(largeExpenseThreshold(Array(12).fill(2000))).toBe(6000);
    expect(largeExpenseThreshold([100, 200])).toBe(5000); // too little history
  });

  it('writes one combined message, or nothing', () => {
    expect(spendingAlertText([], [], 0)).toBeNull();
    const text = spendingAlertText(
      [{ categoryId: 'a', name: '外食', monthToDate: 9000, average: 5000 }],
      [{ amount: 12000, category: '3C', note: '耳機', date: '2026-10-02' }],
      300,
    )!;
    expect(text).toContain('「外食」這個月已經花 9,000 元，比過去 3 個月平均（5,000）多 80%');
    expect(text).toContain('10/2 有一筆 12,000 元（3C・耳機）');
  });
});
