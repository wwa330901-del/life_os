import { computeSettlementDate } from './stock-settlement-schedule';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('computeSettlementDate (T+2)', () => {
  it('skips a plain weekend: Monday trade settles Wednesday', () => {
    const settlement = computeSettlementDate(d(2026, 1, 5)); // Monday
    expect(settlement.getUTCFullYear()).toBe(2026);
    expect(settlement.getUTCMonth()).toBe(0);
    expect(settlement.getUTCDate()).toBe(7); // Wednesday
  });

  it('skips a weekend that falls inside the 2-day window: Friday trade settles the following Tuesday', () => {
    const settlement = computeSettlementDate(d(2026, 1, 9)); // Friday
    expect(settlement.getUTCFullYear()).toBe(2026);
    expect(settlement.getUTCMonth()).toBe(0);
    expect(settlement.getUTCDate()).toBe(13); // Tuesday
  });

  it('skips an entire Chinese New Year holiday run', () => {
    // 2026-02-12 (Thursday) is the last ordinary day before the 9-day
    // 小年夜/除夕/春節x3/補假 + weekend run (2/14 Sat through 2/22 Sun) —
    // T+2 should land on 2/23 (Monday), the first working day after it.
    const settlement = computeSettlementDate(d(2026, 2, 12));
    expect(settlement.getUTCFullYear()).toBe(2026);
    expect(settlement.getUTCMonth()).toBe(1);
    expect(settlement.getUTCDate()).toBe(23);
  });
});
