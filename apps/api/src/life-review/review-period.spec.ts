import { dateKeyString, reviewPeriod } from './review-period';

// 2026-10-04 is a Sunday; 20:00 Taipei = 12:00 UTC.
const SUNDAY_8PM = new Date('2026-10-04T12:00:00Z');

describe('reviewPeriod', () => {
  it('week on Sunday evening covers Mon–Sun, previous week before it', () => {
    const p = reviewPeriod('week', SUNDAY_8PM);
    expect(dateKeyString(p.start)).toBe('2026-09-28');
    expect(dateKeyString(p.end)).toBe('2026-10-05');
    expect(dateKeyString(p.prevStart)).toBe('2026-09-21');
    expect(dateKeyString(p.prevEnd)).toBe('2026-09-28');
    expect(p.label).toBe('9/28–10/4');
    expect(p.partial).toBe(false);
  });

  it('uses the Taipei calendar day, not UTC (Monday 01:00 Taipei is still Sunday in UTC)', () => {
    const p = reviewPeriod('week', new Date('2026-10-04T17:00:00Z')); // Mon 10/5 01:00 Taipei
    expect(dateKeyString(p.start)).toBe('2026-10-05');
    expect(p.partial).toBe(true);
  });

  it('scheduled month review on the 1st covers the whole previous month', () => {
    const p = reviewPeriod('month', new Date('2026-10-01T01:00:00Z'), true);
    expect(dateKeyString(p.start)).toBe('2026-09-01');
    expect(dateKeyString(p.end)).toBe('2026-10-01');
    expect(dateKeyString(p.prevStart)).toBe('2026-08-01');
    expect(dateKeyString(p.prevEnd)).toBe('2026-09-01');
    expect(p.label).toBe('9 月');
  });

  it('on-demand month review compares the same number of days last month', () => {
    const p = reviewPeriod('month', new Date('2026-10-10T04:00:00Z'));
    expect(dateKeyString(p.start)).toBe('2026-10-01');
    expect(dateKeyString(p.end)).toBe('2026-10-11');
    expect(dateKeyString(p.prevStart)).toBe('2026-09-01');
    expect(dateKeyString(p.prevEnd)).toBe('2026-09-11');
    expect(p.partial).toBe(true);
  });
});
