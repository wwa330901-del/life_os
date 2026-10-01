import { detectSubscriptions, subscriptionsText, type ExpenseRow } from './subscriptions';

const row = (date: string, amount: number, note: string | null, categoryId: string | null = 'c1'): ExpenseRow => ({
  date,
  amount,
  note,
  categoryId,
  categoryName: '娛樂',
});

describe('detectSubscriptions', () => {
  it('finds a monthly subscription and predicts the next charge', () => {
    const subs = detectSubscriptions(
      [row('2026-07-15', 390, 'Netflix'), row('2026-08-15', 390, 'netflix'), row('2026-09-15', 390, 'Netflix ')],
      '2026-10-02',
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ name: 'Netflix', amount: 390, cycle: 'monthly', nextDate: '2026-10-15', monthlyCost: 390 });
  });

  it('groups no-note expenses by category + amount', () => {
    const subs = detectSubscriptions([row('2026-07-05', 1200, null, 'gym'), row('2026-08-05', 1200, null, 'gym'), row('2026-09-05', 1200, null, 'gym')], '2026-09-20');
    expect(subs.map((s) => s.nextDate)).toEqual(['2026-10-05']);
  });

  it('ignores irregular amounts, too few months, and stopped subscriptions', () => {
    expect(detectSubscriptions([row('2026-07-15', 390, 'A'), row('2026-08-15', 900, 'A'), row('2026-09-15', 390, 'A')], '2026-10-02')).toEqual([]);
    expect(detectSubscriptions([row('2026-08-15', 390, 'B'), row('2026-09-15', 390, 'B')], '2026-10-02')).toEqual([]);
    expect(detectSubscriptions([row('2026-03-15', 390, 'C'), row('2026-04-15', 390, 'C'), row('2026-05-15', 390, 'C')], '2026-10-02')).toEqual([]);
  });

  it('counts one charge per month even if recorded twice', () => {
    const subs = detectSubscriptions(
      [row('2026-07-15', 390, 'D'), row('2026-08-15', 390, 'D'), row('2026-08-16', 390, 'D'), row('2026-09-15', 390, 'D')],
      '2026-10-02',
    );
    expect(subs[0].charges).toBe(3);
  });

  it('finds a yearly subscription', () => {
    const subs = detectSubscriptions([row('2025-03-01', 1490, 'iCloud 年費'), row('2026-03-02', 1490, 'iCloud年費')], '2026-10-02');
    expect(subs[0]).toMatchObject({ cycle: 'yearly', monthlyCost: 124, nextDate: '2027-03-02' });
  });

  it('summarizes totals', () => {
    const text = subscriptionsText(
      detectSubscriptions([row('2026-07-15', 390, 'Netflix'), row('2026-08-15', 390, 'Netflix'), row('2026-09-15', 390, 'Netflix')], '2026-10-02'),
    );
    expect(text).toContain('每月合計約 390 元，一年約 4,680 元');
  });
});
