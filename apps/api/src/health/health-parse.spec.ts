import { formatMinutes, parseInstant, parseInstantList, parseNumber, sleepFromClock, sleepSpan } from './health-parse';

describe('health-parse', () => {
  it('reads ISO and the iPhone’s Chinese date formats as Taipei time', () => {
    expect(parseInstant('2026-10-01T07:02:00+08:00')?.toISOString()).toBe('2026-09-30T23:02:00.000Z');
    expect(parseInstant('2026/10/1 上午7:02')?.toISOString()).toBe('2026-09-30T23:02:00.000Z');
    expect(parseInstant('2026年9月30日 下午11:30')?.toISOString()).toBe('2026-09-30T15:30:00.000Z');
    expect(parseInstant('2026/10/1 上午12:10')?.toISOString()).toBe('2026-09-30T16:10:00.000Z');
    expect(parseInstant('亂打')).toBeNull();
  });

  it('accepts a list as an array or one time per line', () => {
    expect(parseInstantList(['2026-10-01T07:00:00+08:00', '2026-10-01T03:00:00+08:00'])).toHaveLength(2);
    expect(parseInstantList('2026/9/30 下午11:30\n2026/10/1 上午2:15')).toHaveLength(2);
    expect(parseInstantList(undefined)).toEqual([]);
  });

  it('spans the earliest start to the latest end, rejecting nonsense', () => {
    const span = sleepSpan(parseInstantList('2026/9/30 下午11:30\n2026/10/1 上午2:00'), parseInstantList('2026/10/1 上午2:00\n2026/10/1 上午6:45'));
    expect(span?.minutes).toBe(435);
    expect(sleepSpan(parseInstantList('2026/10/1 上午7:00'), parseInstantList('2026/10/1 上午6:00'))).toBeNull();
  });

  it('puts a late bedtime on the evening before the wake day', () => {
    const night = sleepFromClock('2026-10-01', '23:30', '07:00')!;
    expect(night.startAt.toISOString()).toBe('2026-09-30T15:30:00.000Z');
    expect(night.minutes).toBe(450);
    expect(sleepFromClock('2026-10-01', '00:00', '07:00')!.minutes).toBe(420);
    expect(sleepFromClock('2026-10-01', '1:30', '9:15')!.minutes).toBe(465);
  });

  it('reads numbers sent as text', () => {
    expect(parseNumber('8,532')).toBe(8532);
    expect(parseNumber('70.2 公斤')).toBe(70.2);
    expect(parseNumber(null)).toBeNull();
  });

  it('formats durations', () => {
    expect(formatMinutes(435)).toBe('7 小時 15 分');
    expect(formatMinutes(420)).toBe('7 小時');
    expect(formatMinutes(45)).toBe('45 分');
  });
});
