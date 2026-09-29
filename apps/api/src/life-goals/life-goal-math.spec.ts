import { checkInPeriodStart, goalProgressFraction } from './life-goal-math';

describe('checkInPeriodStart', () => {
  // 2026-09-30 is a Wednesday.
  const wednesdayNoonTaipei = new Date('2026-09-30T04:00:00Z');

  it('TOTAL has no window', () => {
    expect(checkInPeriodStart('TOTAL', wednesdayNoonTaipei)).toBeNull();
  });

  it('WEEKLY starts on Monday (Taipei)', () => {
    expect(checkInPeriodStart('WEEKLY', wednesdayNoonTaipei)?.toISOString()).toBe(
      '2026-09-28T00:00:00.000Z',
    );
  });

  it('WEEKLY on a Sunday still belongs to the week that started the previous Monday', () => {
    const sunday = new Date('2026-10-04T10:00:00Z');
    expect(checkInPeriodStart('WEEKLY', sunday)?.toISOString()).toBe('2026-09-28T00:00:00.000Z');
  });

  it('uses the Taipei date, not UTC, just after midnight in Taipei', () => {
    // 2026-10-01 00:30 Taipei = 2026-09-30 16:30 UTC → month is October.
    const justAfterMidnight = new Date('2026-09-30T16:30:00Z');
    expect(checkInPeriodStart('MONTHLY', justAfterMidnight)?.toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });
});

describe('goalProgressFraction', () => {
  it('counts up from zero when there is no start value', () => {
    expect(goalProgressFraction({ targetValue: 150000, currentValue: 45000, startValue: null })).toBeCloseTo(0.3);
  });

  it('handles a goal that goes down (體重 75 → 70)', () => {
    expect(goalProgressFraction({ targetValue: 70, currentValue: 73, startValue: 75 })).toBeCloseTo(0.4);
  });

  it('clamps overshoot and regress', () => {
    expect(goalProgressFraction({ targetValue: 70, currentValue: 68, startValue: 75 })).toBe(1);
    expect(goalProgressFraction({ targetValue: 70, currentValue: 77, startValue: 75 })).toBe(0);
  });

  it('is null without a target', () => {
    expect(goalProgressFraction({ targetValue: null, currentValue: 3, startValue: null })).toBeNull();
  });
});
