import { isWorkingDay } from '../common/scheduling/holiday-calendar';

/** 自動排時間 (2026-09-30, user's rule):
 * - 工作的事 → 平日（上班日）08:00–18:00
 * - 私人的事 → 平日 19:00–23:00、假日 10:00–22:00
 * - 使用者有特別指定時段就照指定（`customWindow`）
 * 「平日/假日」follows Taiwan's official calendar (國定假日 count as 假日,
 * 補班日 count as 平日) via the shared holiday-calendar helper. */
export type ScheduleKind = 'WORK' | 'PERSONAL';

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface FreeSlot {
  start: Date;
  end: Date;
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const MS_PER_MIN = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;
const STEP_MIN = 30;

const TAIWAN_CALENDAR = {
  weeklyOffDays: [6, 7],
  useTaiwanGovernmentCalendar: true,
  adHocHolidays: [],
  adHocWorkdays: [],
};

/** Minutes-since-midnight windows (Taipei wall clock) for one day. */
export function windowsFor(
  kind: ScheduleKind,
  isWorkday: boolean,
  customWindow?: { startMinute: number; endMinute: number },
): Array<[number, number]> {
  if (customWindow) return [[customWindow.startMinute, customWindow.endMinute]];
  if (kind === 'WORK') return isWorkday ? [[8 * 60, 18 * 60]] : [];
  return isWorkday ? [[19 * 60, 23 * 60]] : [[10 * 60, 22 * 60]];
}

/** "HH:mm" → minutes since midnight, or null. */
export function parseClock(text: string | undefined): number | null {
  const m = text?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
}

/** Earliest free slots of `durationMinutes` between `from` and `to`, inside
 * the kind's windows, not overlapping any busy interval. At most one slot
 * per day (so the user gets real alternatives, not 14:00/14:30/15:00),
 * up to `limit`. Candidate starts are on 30-minute boundaries. */
export function findFreeSlots(params: {
  kind: ScheduleKind;
  durationMinutes: number;
  from: Date;
  to: Date;
  busy: BusyInterval[];
  customWindow?: { startMinute: number; endMinute: number };
  limit?: number;
}): FreeSlot[] {
  const { kind, durationMinutes, from, to, busy, customWindow } = params;
  const limit = params.limit ?? 3;
  const duration = durationMinutes * MS_PER_MIN;
  const slots: FreeSlot[] = [];

  // Walk Taipei calendar days: `dayUtcMidnight` is the date key (UTC midnight
  // of the Taipei date), `dayStartInstant` is that day's real 00:00 Taipei.
  const fromTaipei = new Date(from.getTime() + TAIPEI_OFFSET_MS);
  let dayUtcMidnight = Date.UTC(fromTaipei.getUTCFullYear(), fromTaipei.getUTCMonth(), fromTaipei.getUTCDate());

  while (slots.length < limit) {
    const dayStartInstant = dayUtcMidnight - TAIPEI_OFFSET_MS;
    if (dayStartInstant > to.getTime()) break;

    const workday = isWorkingDay(new Date(dayUtcMidnight), TAIWAN_CALENDAR);
    let found: FreeSlot | null = null;
    for (const [startMin, endMin] of windowsFor(kind, workday, customWindow)) {
      for (let m = startMin; m + durationMinutes <= endMin && !found; m += STEP_MIN) {
        const start = dayStartInstant + m * MS_PER_MIN;
        const end = start + duration;
        if (start < from.getTime() || end > to.getTime()) continue;
        const overlaps = busy.some((b) => start < b.end.getTime() && end > b.start.getTime());
        if (!overlaps) found = { start: new Date(start), end: new Date(end) };
      }
      if (found) break;
    }
    if (found) slots.push(found);
    dayUtcMidnight += MS_PER_DAY;
  }
  return slots;
}
