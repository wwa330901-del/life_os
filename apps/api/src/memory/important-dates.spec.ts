import { nextOccurrence, solarToLunarKey } from './important-dates';

describe('nextOccurrence', () => {
  it('solar date later this year', () => {
    expect(nextOccurrence('2026-10-01', { month: 10, day: 15, isLunar: false })).toEqual({ date: '2026-10-15', daysLeft: 14, years: null });
  });

  it('solar date already passed rolls to next year, counts age', () => {
    expect(nextOccurrence('2026-10-01', { month: 3, day: 15, year: 1990, isLunar: false })).toEqual({
      date: '2027-03-15',
      daysLeft: 165,
      years: 37,
    });
  });

  it('today counts as the occurrence', () => {
    expect(nextOccurrence('2026-10-01', { month: 10, day: 1, isLunar: false }).daysLeft).toBe(0);
  });

  it('Feb 29 falls back to Feb 28 in a common year', () => {
    expect(nextOccurrence('2027-01-01', { month: 2, day: 29, isLunar: false }).date).toBe('2027-02-28');
  });

  it('lunar date converts to the right solar day', () => {
    const occ = nextOccurrence('2026-10-01', { month: 8, day: 15, isLunar: true }); // 中秋
    expect(solarToLunarKey(occ.date)).toBe('8/15');
    expect(occ.daysLeft).toBeGreaterThanOrEqual(0);
    expect(occ.daysLeft).toBeLessThan(400);
  });

  it('lunar new year in January/February comes from the next lunar year', () => {
    const occ = nextOccurrence('2026-10-01', { month: 1, day: 1, isLunar: true });
    expect(occ.date.startsWith('2027-0')).toBe(true);
    expect(solarToLunarKey(occ.date)).toBe('1/1');
  });

  it('lunar day 30 in a short month falls back to 29', () => {
    const occ = nextOccurrence('2026-10-01', { month: 9, day: 30, isLunar: true });
    expect(['9/29', '9/30']).toContain(solarToLunarKey(occ.date));
  });
});
