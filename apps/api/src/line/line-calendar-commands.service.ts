import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { taipeiTodayRange } from '../common/taipei-date';
import { LineReplyService } from './line-reply.service';
import { Responder, LEADING_SEPARATORS, EDGE_SEPARATORS } from './line-shared';

/** LINE 行事曆：新增行事曆、今日行事曆。 */
@Injectable()
export class LineCalendarCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarEventsService: CalendarEventsService,
    private readonly out: LineReplyService,
  ) {}

  /** "新增行事曆 日期 時間 項目 [@地點]" — date is M/D or YYYY/M/D, time is
   * H:MM or 全天 for an all-day event, an optional "@地點" token sets
   * location. Fields may be separated by whitespace/punctuation or nothing
   * at all — date and time are self-delimiting (digits+"/", digits+":"),
   * so they can still be pulled out of glued-together text; @地點 is
   * self-delimiting too. Always the caller's own 1:1 calendar space —
   * unlike 專案代辦事項 there's no multi-space ambiguity to resolve here. */
  async createCalendarEventFromText(
    userId: string,
    text: string,
    respond: Responder,
  ) {
    const parsed = this.parseCalendarCommand(text);
    if (!parsed) {
      await respond(
        '看不懂格式，請用「新增行事曆 日期 時間 項目 [@地點]」，例如「新增行事曆 7/31 14:00 開會 @台北辦公室」；全天活動時間可以打「全天」。',
      );
      return;
    }

    const space = await this.prisma.space.findUnique({
      where: { calendarOwnerUserId: userId },
    });
    if (!space) {
      await respond('你還沒有行事曆空間，請先到元序 App 建立一個。');
      return;
    }

    await this.calendarEventsService.create(userId, space.id, {
      title: parsed.title,
      startAt: parsed.startAt.toISOString(),
      allDay: parsed.allDay,
      location: parsed.location ?? undefined,
    });

    const dateLabel = `${parsed.startAt.getMonth() + 1}/${parsed.startAt.getDate()}`;
    const timeLabel = parsed.allDay
      ? '全天'
      : `${String(parsed.startAt.getHours()).padStart(2, '0')}:${String(parsed.startAt.getMinutes()).padStart(2, '0')}`;
    await respond(`已新增行事曆「${parsed.title}」（${dateLabel} ${timeLabel}）。`);
  }

  /** "今日行事曆" — was a real gap: 行事曆 only ever had "新增", no way to
   * just look at what's already on it. Uses `taipeiTodayRange` (not a naive
   * `new Date()` day boundary) for the same reason `HomeService.todayRange`
   * does — Render's server clock is UTC, not Taiwan time. */
  async sendTodayCalendarEvents(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { calendarOwnerUserId: userId },
    });
    if (!space) {
      await this.out.reply(replyToken, '你還沒有行事曆空間，請先到元序 App 建立一個。');
      return;
    }

    const { start, end } = taipeiTodayRange();
    const events = await this.prisma.calendarEvent.findMany({
      where: { spaceId: space.id, startAt: { gte: start, lt: end } },
      orderBy: { startAt: 'asc' },
    });

    if (events.length === 0) {
      await this.out.reply(replyToken, '📅 今日行事曆\n\n今天沒有排定的行程。');
      return;
    }

    const lines = ['📅 今日行事曆', ''];
    for (const event of events) {
      const timeLabel = event.allDay
        ? '全天'
        : `${String(event.startAt.getHours()).padStart(2, '0')}:${String(event.startAt.getMinutes()).padStart(2, '0')}`;
      lines.push(`・${timeLabel} ${event.title}${event.location ? `（${event.location}）` : ''}`);
    }
    await this.out.reply(replyToken, lines.join('\n'));
  }

  parseCalendarCommand(text: string): {
    startAt: Date;
    allDay: boolean;
    title: string;
    location: string | null;
  } | null {
    let rest = text.replace(/^新增行事曆/, '').replace(LEADING_SEPARATORS, '');

    const dateMatch = rest.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,2}))?/);
    if (!dateMatch) return null;
    const year = dateMatch[3] ? Number(dateMatch[1]) : new Date().getFullYear();
    const month = Number(dateMatch[3] ? dateMatch[2] : dateMatch[1]);
    const day = Number(dateMatch[3] ?? dateMatch[2]);
    rest = rest.slice(dateMatch[0].length).replace(LEADING_SEPARATORS, '');

    let allDay = false;
    let hour = 9;
    let minute = 0;
    if (rest.startsWith('全天')) {
      allDay = true;
      rest = rest.slice(2);
    } else {
      const timeMatch = rest.match(/^(\d{1,2}):(\d{2})/);
      if (!timeMatch) return null;
      hour = Number(timeMatch[1]);
      minute = Number(timeMatch[2]);
      rest = rest.slice(timeMatch[0].length);
    }
    rest = rest.replace(LEADING_SEPARATORS, '');

    const startAt = allDay
      ? new Date(year, month - 1, day)
      : new Date(year, month - 1, day, hour, minute);
    if (Number.isNaN(startAt.getTime())) return null;

    let location: string | null = null;
    const locationMatch = rest.match(/@(\S+)$/);
    if (locationMatch) {
      location = locationMatch[1];
      rest = rest.slice(0, locationMatch.index);
    }

    const title = rest.replace(EDGE_SEPARATORS, '').trim();
    if (!title) return null;

    return { startAt, allDay, title, location };
  }
}
