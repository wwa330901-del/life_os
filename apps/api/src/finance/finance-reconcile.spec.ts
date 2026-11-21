import { planReconcile, reconcileNote } from './finance-reconcile';

describe('planReconcile', () => {
  it('實際比帳上少 → 記一筆「忘記記帳」支出', () => {
    expect(planReconcile(6820, 5000)).toEqual({ difference: -1820, type: 'EXPENSE', amount: 1820, categoryName: '忘記記帳' });
  });

  it('實際比帳上多 → 記一筆「多出來的錢」收入', () => {
    expect(planReconcile(75000, 75200)).toEqual({ difference: 200, type: 'INCOME', amount: 200, categoryName: '多出來的錢' });
  });

  it('信用卡欠更多（負數更大）→ 支出記在卡上', () => {
    expect(planReconcile(-300, -800)).toMatchObject({ type: 'EXPENSE', amount: 500 });
  });

  it('差不到 1 元不用平帳', () => {
    expect(planReconcile(100, 100.4)).toBeNull();
    expect(planReconcile(100, 100)).toBeNull();
  });
});

describe('reconcileNote', () => {
  it('寫帳上和實際', () => {
    expect(reconcileNote(6820, 5000)).toBe('平帳：帳上 6,820 → 實際 5,000');
  });
});
