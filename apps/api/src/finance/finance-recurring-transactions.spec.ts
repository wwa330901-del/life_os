import { effectiveTriggerDate } from './finance-recurring-schedule';

describe('effectiveTriggerDate', () => {
  it('NONE never shifts, even on a holiday', () => {
    // 2026-01-01 開國紀念日 (Thursday).
    const date = effectiveTriggerDate(2026, 0, 1, 31, 'NONE');
    expect(date.getUTCDate()).toBe(1);
  });

  it('EARLIER rolls back through a 9-day holiday+weekend run to the prior working day', () => {
    // 2026-02-20 (day 20, 補假/Friday) sits inside a run that runs
    // Sat 2/14 through Sun 2/22 (weekend + 小年夜/除夕/春節x3/補假 back to
    // back) — EARLIER should roll all the way back to Fri 2/13, the last
    // ordinary working day before the run starts.
    const date = effectiveTriggerDate(2026, 1, 20, 28, 'EARLIER');
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(1);
    expect(date.getUTCDate()).toBe(13);
  });

  it('LATER rolls forward through the same run to the next working day', () => {
    const date = effectiveTriggerDate(2026, 1, 20, 28, 'LATER');
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(1);
    expect(date.getUTCDate()).toBe(23);
  });

  it('LATER rolls forward past a plain weekend to Monday', () => {
    // 2026-01-03 is a plain Saturday (no named holiday nearby).
    const date = effectiveTriggerDate(2026, 0, 3, 31, 'LATER');
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(5); // Monday
  });

  it('clamps dayOfMonth to the month\'s actual last day before adjusting', () => {
    const date = effectiveTriggerDate(2026, 1, 31, 28, 'NONE');
    expect(date.getUTCDate()).toBe(28);
  });
});

describe('recurringMonthStatus', () => {
  const { recurringMonthStatus } = jest.requireActual('./finance-recurring-schedule') as typeof import('./finance-recurring-schedule');

  it('這個月已經記了 → 下次是下個月', () => {
    expect(recurringMonthStatus({ year: 2026, month: 10, day: 21 }, 5, 'NONE', '2026-11')).toEqual({
      firedThisMonth: true,
      thisMonthDate: '2026-11-05',
      nextDate: '2026-12-05',
    });
  });

  it('這個月還沒到 → 下次是這個月那天', () => {
    expect(recurringMonthStatus({ year: 2026, month: 10, day: 21 }, 25, 'NONE', '2026-10')).toMatchObject({
      firedThisMonth: false,
      nextDate: '2026-11-25',
    });
  });

  it('12 月記完 → 下次是隔年 1 月', () => {
    expect(recurringMonthStatus({ year: 2026, month: 11, day: 10 }, 5, 'NONE', '2026-12').nextDate).toBe('2027-01-05');
  });
});
