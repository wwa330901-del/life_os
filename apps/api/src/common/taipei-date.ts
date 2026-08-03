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
