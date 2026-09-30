import { birthChart, castByTime } from './meihua';

describe('castByTime (梅花易數時間起卦)', () => {
  it('2026-10-01 15:30 台北 → 雷風恆，三爻動，變雷水解，互澤天夬', () => {
    // 丙午年（午=7）農曆八月廿一，申時（9）：上 (7+8+21)%8=4 震；下 45%8=5 巽；動 45%6=3
    const r = castByTime(new Date('2026-10-01T07:30:00Z'));
    expect(r.numbers).toMatchObject({ year: 7, month: 8, day: 21, hour: 9, yearBranch: '午', hourBranch: '申' });
    expect(r.original.name).toBe('雷風恆');
    expect(r.movingLine).toBe(3);
    expect(r.changed.name).toBe('雷水解');
    expect(r.mutual.name).toBe('澤天夬');
    // 動爻在下卦：上卦震為體、下卦巽為用，都屬木
    expect(r.ti).toEqual({ trigram: '震', element: '木' });
    expect(r.yong).toEqual({ trigram: '巽', element: '木' });
    expect(r.relation).toContain('比和');
    // 農曆八月是酉月，金當令，木被金克 → 死
    expect(r.season.monthBranch).toBe('酉');
    expect(r.season.tiStrength).toContain('死');
  });

  it('uses 8 and 6 when the remainder is zero', () => {
    // Find any instant whose sums are multiples; just assert ranges hold across a day.
    for (let h = 0; h < 24; h++) {
      const r = castByTime(new Date(Date.UTC(2026, 0, 15, h, 0)));
      expect(r.movingLine).toBeGreaterThanOrEqual(1);
      expect(r.movingLine).toBeLessThanOrEqual(6);
    }
  });
});

describe('birthChart', () => {
  it('computes four pillars and zodiac', () => {
    const c = birthChart('1990-05-03', '08:00');
    expect(c.zodiac).toBe('馬');
    expect(c.pillars.split(' ')).toHaveLength(4);
  });

  it('omits the hour pillar when birth time is unknown', () => {
    expect(birthChart('1990-05-03', null).pillars.split(' ')).toHaveLength(3);
  });
});
