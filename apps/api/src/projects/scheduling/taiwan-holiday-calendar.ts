// Official Taiwan government holidays, sourced from 行政院人事行政總處's
// "中華民國政府行政機關辦公日曆表" (https://data.gov.tw/dataset/14718),
// republished as clean JSON by https://github.com/ruyut/TaiwanCalendar.
//
// Only named holidays are included here — NOT every plain government-
// standard Saturday off-day, since construction crews commonly still work
// ordinary Saturdays unlike office workers who get a full two-day weekend.
// Applied automatically whenever useTaiwanGovernmentCalendar is on (the
// default) — there's no manual per-year import step; any date within a
// covered year is just correct.
//
// Ported verbatim from reno_pm's taiwan_holiday_calendar.dart, including its
// maintenance gap: only 2026-2027 are covered, and isTaiwanHoliday silently
// returns false for any year outside the table (falls back to the weekly
// off-day pattern) — the same tradeoff the source app makes, kept
// deliberately minimal rather than expanded in this port.

export interface TaiwanHolidayEntry {
  date: Date;
  description: string;
}

function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

export const taiwanHolidaysByYear: Record<number, TaiwanHolidayEntry[]> = {
  2026: [
    { date: d(2026, 1, 1), description: '開國紀念日' },
    { date: d(2026, 2, 15), description: '小年夜' },
    { date: d(2026, 2, 16), description: '農曆除夕' },
    { date: d(2026, 2, 17), description: '春節' },
    { date: d(2026, 2, 18), description: '春節' },
    { date: d(2026, 2, 19), description: '春節' },
    { date: d(2026, 2, 20), description: '補假' },
    { date: d(2026, 2, 27), description: '補假' },
    { date: d(2026, 2, 28), description: '和平紀念日' },
    { date: d(2026, 4, 3), description: '補假' },
    { date: d(2026, 4, 4), description: '兒童節' },
    { date: d(2026, 4, 5), description: '清明節' },
    { date: d(2026, 4, 6), description: '補假' },
    { date: d(2026, 5, 1), description: '勞動節' },
    { date: d(2026, 6, 19), description: '端午節' },
    { date: d(2026, 9, 25), description: '中秋節' },
    { date: d(2026, 9, 28), description: '孔子誕辰紀念日/教師節' },
    { date: d(2026, 10, 9), description: '補假' },
    { date: d(2026, 10, 10), description: '國慶日' },
    { date: d(2026, 10, 25), description: '臺灣光復暨金門古寧頭大捷紀念日' },
    { date: d(2026, 10, 26), description: '補假' },
    { date: d(2026, 12, 25), description: '行憲紀念日' },
  ],
  2027: [
    { date: d(2027, 1, 1), description: '開國紀念日' },
    { date: d(2027, 2, 4), description: '小年夜' },
    { date: d(2027, 2, 5), description: '農曆除夕' },
    { date: d(2027, 2, 6), description: '春節' },
    { date: d(2027, 2, 7), description: '春節' },
    { date: d(2027, 2, 8), description: '春節' },
    { date: d(2027, 2, 9), description: '補假' },
    { date: d(2027, 2, 10), description: '補假' },
    { date: d(2027, 2, 28), description: '和平紀念日' },
    { date: d(2027, 3, 1), description: '補假' },
    { date: d(2027, 4, 4), description: '兒童節' },
    { date: d(2027, 4, 5), description: '清明節' },
    { date: d(2027, 4, 6), description: '補假' },
    { date: d(2027, 4, 30), description: '補假' },
    { date: d(2027, 5, 1), description: '勞動節' },
    { date: d(2027, 6, 9), description: '端午節' },
    { date: d(2027, 9, 15), description: '中秋節' },
    { date: d(2027, 9, 28), description: '孔子誕辰紀念日/教師節' },
    { date: d(2027, 10, 10), description: '國慶日' },
    { date: d(2027, 10, 11), description: '補假' },
    { date: d(2027, 10, 25), description: '臺灣光復暨金門古寧頭大捷紀念日' },
    { date: d(2027, 12, 24), description: '補假' },
    { date: d(2027, 12, 25), description: '行憲紀念日' },
    { date: d(2027, 12, 31), description: '補假' },
  ],
};

/**
 * Official 補班日 (mandatory Saturday/Sunday make-up workdays) by year. Both
 * currently-covered years have none — recent calendars have leaned on extra
 * 補假 days off instead — but the structure stays ready for a year that does
 * have one.
 */
export const taiwanMakeupWorkdaysByYear: Record<number, Date[]> = {
  2026: [],
  2027: [],
};

function normalize(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date: Date): string {
  const n = normalize(date);
  return `${n.getFullYear()}-${n.getMonth()}-${n.getDate()}`;
}

const taiwanHolidayDates = new Set<string>();
for (const entries of Object.values(taiwanHolidaysByYear)) {
  for (const entry of entries) taiwanHolidayDates.add(dateKey(entry.date));
}

const taiwanMakeupWorkdayDates = new Set<string>();
for (const dates of Object.values(taiwanMakeupWorkdaysByYear)) {
  for (const date of dates) taiwanMakeupWorkdayDates.add(dateKey(date));
}

/** Years actually covered by taiwanHolidaysByYear. */
export function taiwanHolidayCoveredYears(): number[] {
  return Object.keys(taiwanHolidaysByYear)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Whether `date` is one of the named Taiwan government holidays. */
export function isTaiwanHoliday(date: Date): boolean {
  return taiwanHolidayDates.has(dateKey(date));
}

/** Whether `date` is an official 補班日 (mandatory make-up workday). */
export function isTaiwanMakeupWorkday(date: Date): boolean {
  return taiwanMakeupWorkdayDates.has(dateKey(date));
}
