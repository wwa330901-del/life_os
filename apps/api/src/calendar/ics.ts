/** Minimal single-VEVENT iCalendar builder for writing 元序 events into
 * iCloud over CalDAV (2026-09-30). Kept dependency-free and pure so the
 * escaping/date rules are unit-testable without a CalDAV server.
 *
 * All-day dates follow this codebase's convention of storing an all-day
 * `startAt`/`endAt` as UTC midnight of the calendar date (see
 * CalendarSyncService's Google import), so their UTC components ARE the
 * date. iCalendar's all-day DTEND is exclusive, ours is inclusive — +1 day. */
export interface IcsEventInput {
  uid: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  location?: string | null;
  notes?: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function icsDateTime(d: Date): string {
  return `${icsDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function buildIcsEvent(event: IcsEventInput, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Yuanxu//Life OS//ZH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT'];
  lines.push(`UID:${event.uid}`, `DTSTAMP:${icsDateTime(now)}`);

  if (event.allDay) {
    const lastDay = event.endAt ?? event.startAt;
    lines.push(`DTSTART;VALUE=DATE:${icsDate(event.startAt)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(new Date(lastDay.getTime() + MS_PER_DAY))}`);
  } else {
    const end = event.endAt ?? new Date(event.startAt.getTime() + MS_PER_HOUR);
    lines.push(`DTSTART:${icsDateTime(event.startAt)}`, `DTEND:${icsDateTime(end)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.notes) lines.push(`DESCRIPTION:${escapeIcsText(event.notes)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
