import { taipeiWallClockToUtc } from '../common/taipei-date';

const MS_PER_MINUTE = 60 * 1000;
/** A "night" longer than this is almost certainly two samples from different nights. */
export const MAX_SLEEP_MINUTES = 20 * 60;

/** One date/time as the iPhone 捷徑 sends it — ISO 8601 (「格式化日期 → ISO 8601」),
 * or the phone's own Chinese format like「2026/10/1 上午7:02」/「2026年10月1日 下午11:30」
 * (read as Taipei time). */
export function parseInstant(text: string): Date | null {
  const s = text.trim();
  if (!s) return null;
  const local = s.match(/^(\d{4})[/年-](\d{1,2})[/月-](\d{1,2})日?\s*(上午|下午|AM|PM|am|pm)?\s*(\d{1,2}):(\d{2})/);
  if (local && !/T/.test(s)) {
    let hour = Number(local[5]);
    const half = local[4]?.toLowerCase();
    if ((half === '下午' || half === 'pm') && hour < 12) hour += 12;
    if ((half === '上午' || half === 'am') && hour === 12) hour = 0;
    return taipeiWallClockToUtc(Number(local[1]), Number(local[2]) - 1, Number(local[3]), hour, Number(local[6]));
  }
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** The 捷徑 sends a list of sleep-sample times either as a JSON array or as
 * one text with one time per line — accept both. */
export function parseInstantList(input: unknown): Date[] {
  const parts = Array.isArray(input)
    ? input.map(String)
    : typeof input === 'string'
      ? input.split(/\r?\n|,(?=\s*\d{4})/)
      : [];
  return parts.map(parseInstant).filter((d): d is Date => d != null);
}

/** Number the 捷徑 might send as text (「8,532」「70.2 公斤」). */
export function parseNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  const m = input.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Bedtime/wake as span: earliest start to latest end; null when it doesn't look like one night. */
export function sleepSpan(starts: Date[], ends: Date[]): { startAt: Date; endAt: Date; minutes: number } | null {
  if (starts.length === 0 || ends.length === 0) return null;
  const startAt = new Date(Math.min(...starts.map((d) => d.getTime())));
  const endAt = new Date(Math.max(...ends.map((d) => d.getTime())));
  const minutes = Math.round((endAt.getTime() - startAt.getTime()) / MS_PER_MINUTE);
  if (minutes <= 0 || minutes > MAX_SLEEP_MINUTES) return null;
  return { startAt, endAt, minutes };
}

/** 「23:30 睡、7:00 起」on wake day `wakeDate` (YYYY-MM-DD, Taipei). A bedtime
 * later in the clock than the wake time means it was the previous evening. */
export function sleepFromClock(wakeDate: string, bedtime: string, wake: string): { startAt: Date; endAt: Date; minutes: number } | null {
  const b = parseClock(bedtime);
  const w = parseClock(wake);
  if (!b || !w) return null;
  const [y, m, d] = wakeDate.split('-').map(Number);
  const endAt = taipeiWallClockToUtc(y, m - 1, d, w.hour, w.minute);
  const bedMinutes = b.hour * 60 + b.minute;
  const wakeMinutes = w.hour * 60 + w.minute;
  const startAt = taipeiWallClockToUtc(y, m - 1, bedMinutes >= wakeMinutes ? d - 1 : d, b.hour, b.minute);
  const minutes = Math.round((endAt.getTime() - startAt.getTime()) / MS_PER_MINUTE);
  if (minutes <= 0 || minutes > MAX_SLEEP_MINUTES) return null;
  return { startAt, endAt, minutes };
}

function parseClock(text: string): { hour: number; minute: number } | null {
  const m = text.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** 「7 小時 12 分」 */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} 分`;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}
