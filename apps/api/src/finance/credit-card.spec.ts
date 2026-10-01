import { amountDue, daysBetween, statementDateFor, upcomingDueDate } from './credit-card';

describe('credit card cycle', () => {
  it('finds the next due date, this month or next', () => {
    expect(upcomingDueDate('2026-10-01', 15)).toBe('2026-10-15');
    expect(upcomingDueDate('2026-10-15', 15)).toBe('2026-10-15');
    expect(upcomingDueDate('2026-10-16', 15)).toBe('2026-11-15');
    expect(upcomingDueDate('2026-12-20', 5)).toBe('2027-01-05');
  });

  it('clamps day 31 / 30 to month end', () => {
    expect(upcomingDueDate('2026-02-10', 31)).toBe('2026-02-28');
    expect(upcomingDueDate('2026-03-01', 30)).toBe('2026-03-30');
  });

  it('pairs a due date with the statement before it', () => {
    // 結帳 5 號、繳款 20 號：同一個月
    expect(statementDateFor('2026-10-20', 5)).toBe('2026-10-05');
    // 結帳 25 號、繳款 10 號：上個月結帳
    expect(statementDateFor('2026-10-10', 25)).toBe('2026-09-25');
    expect(statementDateFor('2026-01-10', 25)).toBe('2025-12-25');
    // 結帳 31 號遇到 2 月
    expect(statementDateFor('2026-03-15', 31)).toBe('2026-02-28');
  });

  it('counts days', () => {
    expect(daysBetween('2026-10-12', '2026-10-15')).toBe(3);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('computes what is still owed', () => {
    expect(amountDue(-12345, 0)).toBe(12345);
    expect(amountDue(-12345, 5000)).toBe(7345);
    expect(amountDue(-12345, 20000)).toBe(0);
    expect(amountDue(300, 0)).toBe(0);
  });
});
