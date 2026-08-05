// Pure date math for 行事曆循環事件 — kept dependency-free (no Nest/Prisma
// imports) so it's directly unit-testable, same reasoning as
// ../finance/finance-recurring-schedule.ts. `RecurrenceFrequency` mirrors the
// generated CalendarRecurrenceFrequency type (itself just a string-literal
// union, not a nominal enum), so callers can pass that Prisma type straight
// through without a cast.
//
// A recurring CalendarEvent doesn't materialize one row per occurrence —
// `recurrenceFrequency`/`recurrenceUntil` on the base row describe the whole
// series, and occurrences are generated on the fly for whatever date range
// is being queried. This module only computes WHICH Taipei calendar dates a
// series lands on and WHEN each such occurrence actually starts/ends;
// merging that with per-occurrence exceptions is the caller's job
// (CalendarEventsService/CalendarSharesService).

export type RecurrenceFrequency = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface SeriesLike {
  startAt: Date;
  endAt: Date | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceUntil: Date | null;
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_ITERATIONS = 5000;

function taipeiParts(date: Date) {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function dateKeyOf(year: number, month0: number, day: number): string {
  const normalized = new Date(Date.UTC(year, month0, day));
  return `${normalized.getUTCFullYear()}-${String(normalized.getUTCMonth() + 1).padStart(2, '0')}-${String(normalized.getUTCDate()).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Every Taipei calendar date (as a "YYYY-MM-DD" key) this series lands on
 * within `[rangeFromKey, rangeToKey)` — same half-open convention as the
 * existing `startAt: {gte, lt}` range queries elsewhere. MONTHLY clamps to
 * the month's last day the same way 定期定額/定期交易 already do (see
 * `effectiveTriggerDate`) — day 31 in a 30-day month becomes that month's
 * last day, never rolls into the next month. Fast-forwards the walk to
 * roughly `rangeFromKey` first (rather than always starting from the
 * series' own start date) so a years-old DAILY series doesn't cost
 * thousands of wasted iterations on every query. */
export function occurrenceDateKeysInRange(
  series: SeriesLike,
  rangeFromKey: string,
  rangeToKey: string,
): string[] {
  if (series.recurrenceFrequency === 'NONE') return [];
  const anchor = taipeiParts(series.startAt);
  const untilKey = series.recurrenceUntil ? dateKeyOfTaipeiInstant(series.recurrenceUntil) : null;
  const [rfYear, rfMonth, rfDay] = rangeFromKey.split('-').map(Number);

  let year = anchor.year;
  let month0 = anchor.month0;
  let day = anchor.day;

  if (series.recurrenceFrequency === 'DAILY' || series.recurrenceFrequency === 'WEEKLY') {
    const step = series.recurrenceFrequency === 'DAILY' ? 1 : 7;
    const gapDays = Math.round(
      (Date.UTC(rfYear, rfMonth - 1, rfDay) - Date.UTC(year, month0, day)) / (24 * 60 * 60 * 1000),
    );
    if (gapDays > 0) {
      const stepsToSkip = Math.floor(gapDays / step);
      const jumped = new Date(Date.UTC(year, month0, day + stepsToSkip * step));
      year = jumped.getUTCFullYear();
      month0 = jumped.getUTCMonth();
      day = jumped.getUTCDate();
    }
  } else {
    const monthsGap = (rfYear - year) * 12 + (rfMonth - 1 - month0);
    if (monthsGap > 0) {
      const totalMonths = month0 + monthsGap;
      year += Math.floor(totalMonths / 12);
      month0 = ((totalMonths % 12) + 12) % 12;
      day = Math.min(anchor.day, lastDayOfMonth(year, month0));
    }
  }

  const keys: string[] = [];
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const key = dateKeyOf(year, month0, day);
    if (key >= rangeToKey) break;
    if (untilKey && key > untilKey) break;
    if (key >= rangeFromKey) keys.push(key);

    if (series.recurrenceFrequency === 'DAILY') {
      const next = new Date(Date.UTC(year, month0, day + 1));
      year = next.getUTCFullYear();
      month0 = next.getUTCMonth();
      day = next.getUTCDate();
    } else if (series.recurrenceFrequency === 'WEEKLY') {
      const next = new Date(Date.UTC(year, month0, day + 7));
      year = next.getUTCFullYear();
      month0 = next.getUTCMonth();
      day = next.getUTCDate();
    } else {
      month0 += 1;
      if (month0 > 11) {
        month0 = 0;
        year += 1;
      }
      day = Math.min(anchor.day, lastDayOfMonth(year, month0));
    }
  }
  return keys;
}

function dateKeyOfTaipeiInstant(date: Date): string {
  const p = taipeiParts(date);
  return dateKeyOf(p.year, p.month0, p.day);
}

/** Reconstructs one occurrence's actual `startAt`/`endAt` instants — same
 * Taipei time-of-day as the series' own `startAt`, shifted onto
 * `occurrenceDateKey`'s calendar date, preserving the series' original
 * duration (if it had an `endAt`) rather than its literal end time (so a
 * multi-day series event, if one ever existed, keeps its length). */
export function occurrenceStartEnd(
  series: { startAt: Date; endAt: Date | null },
  occurrenceDateKey: string,
): { startAt: Date; endAt: Date | null } {
  const [year, month, day] = occurrenceDateKey.split('-').map(Number);
  const anchor = taipeiParts(series.startAt);
  const startAt = new Date(
    Date.UTC(year, month - 1, day, anchor.hour, anchor.minute) - TAIPEI_OFFSET_MS,
  );
  if (!series.endAt) return { startAt, endAt: null };
  const durationMs = series.endAt.getTime() - series.startAt.getTime();
  return { startAt, endAt: new Date(startAt.getTime() + durationMs) };
}

interface ExceptionLike {
  id: string;
  occurrenceDateKey: string;
  cancelled: boolean;
  title: string | null;
  startAt: Date | null;
  endAt: Date | null;
  allDay: boolean | null;
  location: string | null;
  notes: string | null;
}

export interface ExpandedOccurrence {
  occurrenceDateKey: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  isException: boolean;
  exceptionId: string | null;
}

/** Merges a series' generated occurrences (within range) with its
 * exceptions — a cancelled exception drops that date entirely, a live one
 * is a COMPLETE standalone snapshot (see the doc comment on
 * `CalendarEventException` — once one exists it's never partially
 * null-means-inherit-from-series, `updateOccurrence`'s THIS-scope write
 * path always resolves every field before saving), so no per-field
 * series-fallback logic is needed here. */
export function expandSeriesOccurrences(
  series: SeriesLike & { title: string; allDay: boolean; location: string | null; notes: string | null },
  exceptions: ExceptionLike[],
  rangeFromKey: string,
  rangeToKey: string,
): ExpandedOccurrence[] {
  const exceptionByKey = new Map(exceptions.map((e) => [e.occurrenceDateKey, e]));
  const keys = occurrenceDateKeysInRange(series, rangeFromKey, rangeToKey);
  const result: ExpandedOccurrence[] = [];

  for (const key of keys) {
    const exception = exceptionByKey.get(key);
    if (exception?.cancelled) continue;

    if (exception) {
      result.push({
        occurrenceDateKey: key,
        title: exception.title!,
        startAt: exception.startAt!,
        endAt: exception.endAt,
        allDay: exception.allDay!,
        location: exception.location,
        notes: exception.notes,
        isException: true,
        exceptionId: exception.id,
      });
      continue;
    }

    const { startAt, endAt } = occurrenceStartEnd(series, key);
    result.push({
      occurrenceDateKey: key,
      title: series.title,
      startAt,
      endAt,
      allDay: series.allDay,
      location: series.location,
      notes: series.notes,
      isException: false,
      exceptionId: null,
    });
  }
  return result;
}

/** The Taipei calendar date immediately before `dateKey` — used when
 * truncating a series' `recurrenceUntil` for a 這次以後 (FOLLOWING) scoped
 * edit/delete, so the original series' last occurrence is the day before
 * the split point. */
export function dateKeyBefore(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return dateKeyOf(year, month - 1, day - 1);
}
