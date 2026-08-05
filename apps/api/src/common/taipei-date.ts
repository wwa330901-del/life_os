const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "今天" for every 今日-labeled feature (首頁儀表板/財務總覽/代辦事項總覽/...)
 * must mean Asia/Taipei's calendar day, not the server process's own local
 * timezone — Render's containers default to UTC, so a naive
 * `new Date(now.getFullYear(), now.getMonth(), now.getDate())` is wrong for
 * roughly 8 hours every day (Taipei's 00:00–08:00, while UTC is still on
 * the previous date): a todo/transaction dated "today" in Taiwan then falls
 * just outside the server's UTC-only "today" window and silently doesn't
 * show up (2026-08-04 bug: 首頁「本日代辦事項」missing items due today).
 * This computes the UTC instants bounding Taipei's current calendar day,
 * regardless of what timezone the Node process itself runs in. */
export function taipeiTodayRange(): { start: Date; end: Date } {
  const shifted = new Date(Date.now() + TAIPEI_OFFSET_MS);
  const start = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - TAIPEI_OFFSET_MS,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** "YYYY-MM" for Taipei's current calendar month — same reasoning as
 * `taipeiTodayRange`, for month-scoped queries (e.g. 財務總覽's monthly
 * summary) evaluated in the first/last few hours of a month. */
export function taipeiCurrentMonth(): string {
  const shifted = new Date(Date.now() + TAIPEI_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Given hour/minute the user typed as Taipei local time (e.g. LINE's
 * "新增行事曆"/"新增 <date> <time>" commands), returns the UTC `Date`
 * instant that actually represents — the inverse of `formatTaipeiDateTime`
 * below. Taipei has no DST, so this is always a flat -8h shift; `Date.UTC`
 * normalizes a negative hour into the previous UTC day on its own. */
export function taipeiWallClockToUtc(year: number, month0: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month0, day, hour - 8, minute));
}

/** Renders a stored UTC `Date` back as a Taipei-local "M/D" (allDay) or
 * "M/D HH:MM" label for a LINE reply — same "+8h then read UTC parts"
 * trick as `taipeiTodayRange`, generalized to an arbitrary instant rather
 * than just "now". Never use the non-UTC `Date.getMonth`/`getHours`
 * getters directly on a stored due-date/event time for a user-facing
 * label — they read back in the *server's* local zone (UTC on Render),
 * which silently shows the wrong day for any time before 08:00 Taipei. */
export function formatTaipeiDateTime(date: Date, allDay: boolean): string {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  if (allDay) return `${month}/${day}`;
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

/** A stored UTC instant's own Taipei calendar date, as "YYYY-MM-DD" — the
 * key type 行事曆循環事件's occurrence generation (calendar-recurrence.ts)
 * uses throughout, since occurrence dates are always Taipei calendar days,
 * never UTC ones. */
export function taipeiDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Inverse-ish of `taipeiDateKey` — midnight UTC of the given Taipei
 * calendar date, i.e. what a `@db.Date` "which occurrence" column (like
 * `CalendarEventException.occurrenceDate`) stores. Not the same instant as
 * that day's actual midnight in Taipei (`taipeiWallClockToUtc(y, m, d, 0,
 * 0)` is) — this is purely a date-identity key, comparable with `<`/`>`/
 * `===` against other values produced the same way, never displayed. */
export function taipeiDateKeyToUtcMidnight(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Reads a `@db.Date`-style "pure date key" column (like
 * `CalendarEventException.occurrenceDate`, always written via
 * `taipeiDateKeyToUtcMidnight`) back out as the same "YYYY-MM-DD" key —
 * NOT `taipeiDateKey`, which is for real timestamped instants and would
 * apply an unwanted +8h shift here (harmless by coincidence for a
 * midnight-UTC value, but the wrong function to reach for). */
export function utcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
