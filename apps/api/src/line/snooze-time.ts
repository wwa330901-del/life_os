import { taipeiWallClockToUtc } from '../common/taipei-date';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const WEEKDAY_INDEX: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const CN_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const DAY_WORDS: Record<string, { offset: number; period?: string }> = {
  今天: { offset: 0 },
  今晚: { offset: 0, period: '晚上' },
  明天: { offset: 1 },
  明早: { offset: 1, period: '早上' },
  明晚: { offset: 1, period: '晚上' },
  後天: { offset: 2 },
  大後天: { offset: 3 },
};
/** 只講「明天下午」沒講幾點時用的時間。 */
const PERIOD_DEFAULT_HOUR: Record<string, number> = { 凌晨: 5, 清晨: 6, 早上: 9, 上午: 9, 中午: 12, 下午: 15, 傍晚: 18, 晚上: 20 };

function cnToNumber(cn: string): string {
  if (!cn.includes('十')) return [...cn].map((c) => CN_DIGITS[c]).join('');
  const [tens, ones] = cn.split('十');
  return String((tens ? CN_DIGITS[tens] : 1) * 10 + (ones ? CN_DIGITS[ones] : 0));
}

function toTwentyFourHour(hour: number, period: string | undefined): number {
  if (!period) return hour;
  if (['下午', '傍晚', '晚上'].includes(period)) return hour < 12 ? hour + 12 : hour === 12 && period === '晚上' ? 24 : hour;
  if (period === '中午') return hour < 10 ? hour + 12 : hour;
  if (period === '凌晨' && hour === 12) return 0;
  return hour;
}

function relativeMinutes(text: string): number | null {
  const compact = text.replace(/\s/g, '');
  let m: RegExpMatchArray | null;
  if (/^半個?(小時|鐘頭)$/.test(compact)) return 30;
  if ((m = compact.match(/^(\d+)個半(小時|鐘頭)$/))) return Number(m[1]) * 60 + 30;
  if ((m = compact.match(/^(\d+(?:\.\d+)?)個?(?:小時|鐘頭)(?:(\d+)分鐘?|半)?$/))) {
    return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : compact.endsWith('半') ? 30 : 0);
  }
  if ((m = compact.match(/^(\d+)分鐘?$/)) || (m = compact.match(/^(\d{1,3})$/))) return Number(m[1]);
  if ((m = compact.match(/^(\d+)天$/))) return Number(m[1]) * 24 * 60;
  return null;
}

/** 按了提醒的「延後」之後打的時間，換成提醒時刻（一律當台北時間）。看不懂就回
 * null，呼叫端會把那句話當一般訊息處理。一定回比 now 晚的時間。 */
export function parseSnoozeTime(input: string, now: Date): Date | null {
  let text = input
    .trim()
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/／/g, '/')
    .replace(/(之?後|再提醒我?|再叫我|提醒我?|叫我|再說|吧|好了)+$/, '')
    .replace(/^(延到|延後到?|改到|改成|等到?|過|再)+/, '')
    .trim();
  if (!text) return null;

  const shifted = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  let year = shifted.getUTCFullYear();
  let month0 = shifted.getUTCMonth();
  let day = shifted.getUTCDate();
  const moveDays = (n: number) => {
    const moved = new Date(Date.UTC(year, month0, day) + n * MS_PER_DAY);
    year = moved.getUTCFullYear();
    month0 = moved.getUTCMonth();
    day = moved.getUTCDate();
  };

  // 星期要在中文數字換掉之前抓（「週一」的一不是數字）。
  let weekday: number | null = null;
  const weekdayMatch = text.match(/^(?:下個?)?(?:週|周|星期|禮拜)([一二三四五六日天])/);
  if (weekdayMatch) {
    weekday = WEEKDAY_INDEX[weekdayMatch[1]];
    text = text.slice(weekdayMatch[0].length).trim();
  }
  text = text.replace(/[零一二兩三四五六七八九十]+/g, cnToNumber);

  if (weekday === null) {
    const minutes = relativeMinutes(text);
    if (minutes !== null) return minutes > 0 ? new Date(now.getTime() + Math.round(minutes * MS_PER_MINUTE)) : null;
  }

  let period: string | undefined;
  let hasDate = false;
  let explicitToday = false;
  let monthDay = false;
  const dayWord = text.match(/^(大後天|後天|今天|今晚|明天|明早|明晚)/);
  const dateMatch = text.match(/^(\d{1,2})[/月-](\d{1,2})[日號]?/);
  if (dayWord) {
    const word = DAY_WORDS[dayWord[1]];
    moveDays(word.offset);
    period = word.period;
    hasDate = true;
    explicitToday = word.offset === 0;
    text = text.slice(dayWord[0].length).trim();
  } else if (dateMatch) {
    month0 = Number(dateMatch[1]) - 1;
    day = Number(dateMatch[2]);
    const check = new Date(Date.UTC(year, month0, day));
    if (check.getUTCMonth() !== month0 || check.getUTCDate() !== day) return null;
    hasDate = true;
    monthDay = true;
    text = text.slice(dateMatch[0].length).trim();
  } else if (weekday !== null) {
    const todayWeekday = new Date(Date.UTC(year, month0, day)).getUTCDay();
    moveDays((weekday - todayWeekday + 7) % 7);
    hasDate = true;
  }

  const periodMatch = text.match(/^(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上)/);
  if (periodMatch) {
    period = periodMatch[1];
    text = text.slice(periodMatch[0].length);
  }
  text = text.replace(/\s/g, '');

  let hour: number;
  let minute = 0;
  if (!text) {
    if (period) hour = PERIOD_DEFAULT_HOUR[period];
    else if (hasDate) {
      hour = shifted.getUTCHours();
      minute = shifted.getUTCMinutes();
    } else return null;
  } else {
    const time =
      text.match(/^(\d{1,2}):(\d{2})$/) ?? text.match(/^(\d{2})(\d{2})$/) ?? text.match(/^(\d{1,2})(?:點|時)(?:(\d{1,2})分?|(半))?$/);
    if (!time) return null;
    hour = Number(time[1]);
    minute = time[3] ? 30 : Number(time[2] ?? 0);
  }
  if (hour > 24 || minute > 59 || (hour === 24 && minute > 0)) return null;

  const typedHour = hour;
  hour = toTwentyFourHour(hour, period);
  // 沒講早上下午的明天 3 點，當下午；9 點就是早上。
  if (!period && hasDate && !explicitToday && text && hour >= 1 && hour <= 6) hour += 12;

  let at = taipeiWallClockToUtc(year, month0, day, hour, minute);
  if (at > now) return at;
  if (monthDay) {
    at = taipeiWallClockToUtc(year + 1, month0, day, hour, minute);
    return at > now ? at : null;
  }
  if (hasDate && !explicitToday && weekday === null) return null;
  // 下午 4 點打「3 點」＝已經過了的 3 點，先試下午，再不行才明天。
  if (!period && text && typedHour < 12) {
    at = taipeiWallClockToUtc(year, month0, day, typedHour + 12, minute);
    if (at > now) return at;
  }
  if (explicitToday) return null;
  return new Date(taipeiWallClockToUtc(year, month0, day, hour, minute).getTime() + (weekday !== null ? 7 : 1) * MS_PER_DAY);
}

/** LINE 日期時間選擇器回傳／接收的 "2026-11-09T15:30"（台北時間）。 */
export function pickerValueToDate(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return taipeiWallClockToUtc(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

export function dateToPickerValue(date: Date): string {
  return new Date(date.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 16);
}
