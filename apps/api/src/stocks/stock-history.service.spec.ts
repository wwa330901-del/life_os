import { DailyBar, summarizeTrend } from './stock-history.service';

function bars(closes: number[]): DailyBar[] {
  return closes.map((close, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volumeLots: 1000 + i,
  }));
}

describe('summarizeTrend', () => {
  it('returns null with no data', () => {
    expect(summarizeTrend([])).toBeNull();
  });

  it('computes changes, moving averages and distance from high', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i); // 100..124
    const s = summarizeTrend(bars(closes))!;
    expect(s.latestClose).toBe(124);
    expect(s.change5dPct).toBe(4.2); // 124 vs 119
    expect(s.change20dPct).toBe(19.23); // 124 vs 104
    expect(s.change60dPct).toBeNull();
    expect(s.ma5).toBe(122);
    expect(s.ma20).toBe(114.5);
    expect(s.ma60).toBeNull();
    expect(s.periodHigh).toBe(125);
    expect(s.periodLow).toBe(99);
    expect(s.fromHighPct).toBe(-0.8);
    expect(s.recentCloses).toHaveLength(10);
    expect(s.tradingDays).toBe(25);
  });
});
