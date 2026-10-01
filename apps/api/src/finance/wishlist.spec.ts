import { defaultWishlistBudget, planPurchases, type WishInput } from './wishlist';

const wish = (id: string, price: number, priority = 2, targetMonth: string | null = null, created = 0): WishInput => ({
  id,
  name: id,
  price,
  priority,
  targetMonth,
  createdAt: new Date(created),
});

describe('planPurchases', () => {
  it('saves up in priority order', () => {
    const plan = planPurchases([wish('ps5', 15000, 2), wish('airpods', 7500, 1), wish('book', 400, 3)], 5000, '2026-10');
    // airpods 7500 → 2 months (10,11); +ps5 = 22500 → 5 months (…2027-02); +book 22900 → 5 months
    expect(plan.map((p) => [p.id, p.month])).toEqual([
      ['airpods', '2026-11'],
      ['ps5', '2027-02'],
      ['book', '2027-02'],
    ]);
  });

  it('something affordable this month is this month', () => {
    expect(planPurchases([wish('a', 300)], 5000, '2026-10')[0].month).toBe('2026-10');
  });

  it('flags items that miss their target date and says how much is needed', () => {
    const [p] = planPurchases([wish('trip', 30000, 1, '2026-12')], 5000, '2026-10');
    expect(p).toEqual({ id: 'trip', month: '2027-03', onTime: false, neededMonthly: 10000 });
  });

  it('cannot plan without money to set aside', () => {
    expect(planPurchases([wish('a', 300)], 0, '2026-10')[0].month).toBeNull();
  });

  it('defaults to 30% of the average surplus, rounded to 100', () => {
    expect(defaultWishlistBudget(60000, 45000)).toBe(4500);
    expect(defaultWishlistBudget(40000, 45000)).toBe(0);
  });
});
