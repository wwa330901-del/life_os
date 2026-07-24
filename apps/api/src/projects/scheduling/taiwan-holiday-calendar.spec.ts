// Ported 1:1 from reno_pm's taiwan_holiday_calendar_test.dart.

import { taiwanHolidaysByYear, taiwanMakeupWorkdaysByYear } from './taiwan-holiday-calendar';

describe('taiwanHolidaysByYear', () => {
  it('every entry actually falls within its own map key year', () => {
    for (const [year, entries] of Object.entries(taiwanHolidaysByYear)) {
      for (const holiday of entries) {
        expect(holiday.date.getUTCFullYear()).toBe(Number(year));
      }
    }
  });

  it('every entry has a non-empty description', () => {
    for (const entries of Object.values(taiwanHolidaysByYear)) {
      for (const holiday of entries) {
        expect(holiday.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('has no duplicate dates within a year', () => {
    for (const entries of Object.values(taiwanHolidaysByYear)) {
      const keys = entries.map((e) => e.date.getTime());
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('includes the well-known fixed national holidays', () => {
    const entries2026 = taiwanHolidaysByYear[2026];
    const byDate = new Map(entries2026.map((e) => [e.date.getTime(), e.description]));

    expect(byDate.get(Date.UTC(2026, 0, 1))).toBe('開國紀念日');
    expect(byDate.get(Date.UTC(2026, 4, 1))).toBe('勞動節');
    expect(byDate.get(Date.UTC(2026, 9, 10))).toBe('國慶日');
  });
});

describe('taiwanMakeupWorkdaysByYear', () => {
  it('every entry actually falls within its own map key year', () => {
    for (const [year, dates] of Object.entries(taiwanMakeupWorkdaysByYear)) {
      for (const date of dates) {
        expect(date.getUTCFullYear()).toBe(Number(year));
      }
    }
  });
});
