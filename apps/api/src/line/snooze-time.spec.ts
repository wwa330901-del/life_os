import { dateToPickerValue, parseSnoozeTime, pickerValueToDate } from './snooze-time';
import { formatTaipeiDateTime, taipeiWallClockToUtc } from '../common/taipei-date';

// 2026-11-09（一）10:00 台北時間
const now = taipeiWallClockToUtc(2026, 10, 9, 10, 0);
const parsed = (text: string, at = now) => {
  const result = parseSnoozeTime(text, at);
  return result ? formatTaipeiDateTime(result, false) : null;
};

describe('parseSnoozeTime', () => {
  it.each([
    ['30', '11/9 10:30'],
    ['30分', '11/9 10:30'],
    ['30 分鐘後', '11/9 10:30'],
    ['三十分鐘', '11/9 10:30'],
    ['半小時', '11/9 10:30'],
    ['2小時', '11/9 12:00'],
    ['兩個小時後', '11/9 12:00'],
    ['1.5小時', '11/9 11:30'],
    ['一個半小時', '11/9 11:30'],
    ['1小時半', '11/9 11:30'],
    ['延後10分鐘', '11/9 10:10'],
    ['２天', '11/11 10:00'],
  ])('relative: %s → %s', (text, expected) => {
    expect(parsed(text)).toBe(expected);
  });

  it.each([
    ['15:30', '11/9 15:30'],
    ['15：30', '11/9 15:30'],
    ['1530', '11/9 15:30'],
    ['下午3點', '11/9 15:00'],
    ['下午三點半', '11/9 15:30'],
    ['晚上8點20', '11/9 20:20'],
    ['晚上十點二十分', '11/9 22:20'],
    ['中午', '11/9 12:00'],
    ['中午1點', '11/9 13:00'],
    ['今晚', '11/9 20:00'],
    ['3點', '11/9 15:00'], // 早上 3 點已過，當下午
    ['11點', '11/9 11:00'],
    ['8點', '11/9 20:00'],
    ['早上8點', '11/10 08:00'], // 講明早上且已過＝明天
  ])('today: %s → %s', (text, expected) => {
    expect(parsed(text)).toBe(expected);
  });

  it.each([
    ['明天', '11/10 10:00'],
    ['明天9點', '11/10 09:00'],
    ['明天3點', '11/10 15:00'],
    ['明天早上', '11/10 09:00'],
    ['明天下午', '11/10 15:00'],
    ['明早8點', '11/10 08:00'],
    ['明晚7點半', '11/10 19:30'],
    ['後天 14:00', '11/11 14:00'],
    ['11/12', '11/12 10:00'],
    ['11/1 9點', '11/1 09:00'], // 已過＝明年
    ['11/12 15:30', '11/12 15:30'],
    ['11月12日下午2點', '11/12 14:00'],
    ['週五9點', '11/13 09:00'],
    ['星期五下午', '11/13 15:00'],
    ['禮拜一早上8點', '11/16 08:00'], // 今天週一 8 點已過＝下週一
  ])('dates: %s → %s', (text, expected) => {
    expect(parsed(text)).toBe(expected);
  });

  it('11/1 past rolls into next year', () => {
    expect(parseSnoozeTime('11/1 9點', now)!.getUTCFullYear()).toBe(2027);
  });

  it('crosses midnight: 晚上 12 點', () => {
    expect(parsed('晚上12點')).toBe('11/10 00:00');
  });

  it('late at night, a passed time moves to tomorrow', () => {
    expect(parsed('3點', taipeiWallClockToUtc(2026, 10, 9, 23, 0))).toBe('11/10 03:00');
  });

  it('crosses month and year ends', () => {
    expect(parsed('明天9點', taipeiWallClockToUtc(2026, 11, 31, 10, 0))).toBe('1/1 09:00');
  });

  it('uses the Taipei calendar day while UTC is still yesterday', () => {
    expect(parsed('明天9點', taipeiWallClockToUtc(2026, 10, 9, 2, 0))).toBe('11/10 09:00');
  });

  it.each(['等一下', '今天吃什麼', '財務總覽', '0', '25:00', '13/40', '2/30 9點', '今天3點半早上', '買了 3 張 0050'])(
    'not a time: %s',
    (text) => {
      expect(parseSnoozeTime(text, now)).toBeNull();
    },
  );

  it('an already-passed 今天 is not silently moved', () => {
    expect(parseSnoozeTime('今天早上8點', now)).toBeNull();
  });
});

describe('LINE datetime picker values', () => {
  it('round-trips as Taipei wall clock', () => {
    const at = pickerValueToDate('2026-11-09T15:30')!;
    expect(at.toISOString()).toBe('2026-11-09T07:30:00.000Z');
    expect(dateToPickerValue(at)).toBe('2026-11-09T15:30');
  });

  it('rejects garbage', () => {
    expect(pickerValueToDate('soon')).toBeNull();
  });
});
