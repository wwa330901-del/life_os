import { inclusiveEnd } from './apple-calendar-sync.service';

describe('inclusiveEnd（iCloud 全天事件結束日）', () => {
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

  it('一天的全天行程：DTEND 隔天 → 結束日就是當天', () => {
    expect(inclusiveEnd(day('2026-10-14'), day('2026-10-15'), true)).toEqual(day('2026-10-14'));
  });

  it('三天的全天行程：DTEND 第四天 → 結束日第三天', () => {
    expect(inclusiveEnd(day('2026-10-14'), day('2026-10-17'), true)).toEqual(day('2026-10-16'));
  });

  it('DTEND 跟開始同一天（不標準）不會早於開始', () => {
    expect(inclusiveEnd(day('2026-10-14'), day('2026-10-14'), true)).toEqual(day('2026-10-14'));
  });

  it('有時間的行程不動', () => {
    const end = new Date('2026-10-14T10:00:00.000Z');
    expect(inclusiveEnd(new Date('2026-10-14T09:00:00.000Z'), end, false)).toBe(end);
  });
});
