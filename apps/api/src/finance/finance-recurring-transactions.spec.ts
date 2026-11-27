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

import { dueTriggerDate } from './finance-recurring-schedule';

describe('dueTriggerDate（錯過了要補）', () => {
  it('扣款日當天到期', () => {
    expect(dueTriggerDate('2026-11-25', 25, 'NONE', null, '2026-10-01')?.toISOString().slice(0, 10)).toBe('2026-11-25');
  });
  it('伺服器睡著錯過了，兩天後還是會補（日期記扣款日）', () => {
    expect(dueTriggerDate('2026-11-27', 25, 'NONE', '2026-10', '2026-10-01')?.toISOString().slice(0, 10)).toBe('2026-11-25');
  });
  it('還沒到扣款日不跑', () => {
    expect(dueTriggerDate('2026-11-24', 25, 'NONE', '2026-10', '2026-10-01')).toBeNull();
  });
  it('這個月已經跑過不再跑', () => {
    expect(dueTriggerDate('2026-11-27', 25, 'NONE', '2026-11', '2026-10-01')).toBeNull();
  });
  it('扣款日之後才建立的，這個月不補', () => {
    expect(dueTriggerDate('2026-11-27', 5, 'NONE', null, '2026-11-20')).toBeNull();
  });
  it('扣款日當天建立的，當天就跑', () => {
    expect(dueTriggerDate('2026-11-25', 25, 'NONE', null, '2026-11-25')).not.toBeNull();
  });
  it('從沒跑過（null）也會跑', () => {
    expect(dueTriggerDate('2026-12-01', 1, 'NONE', null, '2026-11-01')).not.toBeNull();
  });
});
