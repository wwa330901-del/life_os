import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from './google-calendar.service';
import { AppleCalendarService } from './apple-calendar.service';
import { buildIcsEvent } from './ics';
import { CalendarRecurrenceFrequency, CalendarSyncTarget } from '../../generated/prisma/client.js';
import type { CalendarEvent } from '../../generated/prisma/client.js';

/** iCloud recurring events are imported expanded, one row per occurrence,
 * with a `${uid}::${start}` UID (see AppleCalendarSyncService) — there's no
 * single CalDAV object behind one occurrence to write back to. */
export function isExpandedICloudOccurrence(event: Pick<CalendarEvent, 'appleEventUid'>): boolean {
  return event.appleEventUid?.includes('::') ?? false;
}

export function assertEditableInYuanxu(event: Pick<CalendarEvent, 'appleEventUid'>): void {
  if (isExpandedICloudOccurrence(event)) {
    throw new BadRequestException('這是 iPhone 上的重複行程，請直接在 iPhone 上修改或刪除');
  }
}

export function newICloudUid(eventId: string): string {
  return `${eventId}@yuanxu`;
}

/** Pushes local event changes out to whichever calendar the event belongs
 * to (2026-09-30: every event created in 元序 must pick Google or iPhone).
 * A `syncTarget` of null is pre-feature data and keeps the old behavior:
 * push to Google if connected, never push iCloud-imported rows. Recurring
 * series are still never pushed anywhere — unchanged limitation, see
 * CalendarEventsService's doc comments. */
@Injectable()
export class CalendarPushService {
  private readonly logger = new Logger(CalendarPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarService,
    private readonly apple: AppleCalendarService,
  ) {}

  effectiveTarget(event: Pick<CalendarEvent, 'syncTarget' | 'appleEventUid'>): CalendarSyncTarget | null {
    if (event.syncTarget) return event.syncTarget;
    return event.appleEventUid ? null : CalendarSyncTarget.GOOGLE;
  }

  /** Fire-and-forget wrapper — a slow or failing remote never blocks the
   * user's own save; the periodic sync jobs retry anything left unpushed. */
  pushInBackground(event: CalendarEvent): void {
    this.push(event).catch((error) => {
      this.logger.warn(`推送行程到外部行事曆失敗（本機已儲存，等待下次同步重試）：${error}`);
    });
  }

  async push(event: CalendarEvent): Promise<void> {
    if (event.recurrenceFrequency !== CalendarRecurrenceFrequency.NONE) return;
    const target = this.effectiveTarget(event);
    if (target === CalendarSyncTarget.GOOGLE) await this.pushGoogle(event);
    if (target === CalendarSyncTarget.ICLOUD) await this.pushICloud(event);
  }

  /** Removes the remote copy (both sides, whichever ids are set). Errors are
   * logged, not thrown — the local delete already happened. */
  async removeRemote(event: CalendarEvent): Promise<void> {
    if (event.googleEventId) {
      const connection = await this.prisma.googleCalendarConnection.findUnique({ where: { spaceId: event.spaceId } });
      if (connection) {
        await this.google.deleteEvent(connection, event.googleEventId).catch((error) => {
          this.logger.warn(`刪除 Google 行程失敗：${error}`);
        });
      }
    }
    if (event.appleEventHref) {
      const connection = await this.prisma.appleCalendarConnection.findUnique({ where: { spaceId: event.spaceId } });
      if (connection) {
        await this.apple.deleteEvent(connection, event.appleEventHref, event.appleEventEtag).catch((error) => {
          this.logger.warn(`刪除 iCloud 行程失敗：${error}`);
        });
      }
    }
  }

  private async pushGoogle(event: CalendarEvent): Promise<void> {
    const connection = await this.prisma.googleCalendarConnection.findUnique({ where: { spaceId: event.spaceId } });
    if (!connection) return;
    const input = {
      title: event.title,
      location: event.location,
      notes: event.notes,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
    };
    if (event.googleEventId) {
      await this.google.updateEvent(connection, event.googleEventId, input);
      return;
    }
    const googleEventId = await this.google.insertEvent(connection, input);
    await this.prisma.calendarEvent.update({ where: { id: event.id }, data: { googleEventId } });
  }

  private async pushICloud(event: CalendarEvent): Promise<void> {
    if (isExpandedICloudOccurrence(event)) return;
    const connection = await this.prisma.appleCalendarConnection.findUnique({ where: { spaceId: event.spaceId } });
    if (!connection) return;

    const uid = event.appleEventUid ?? newICloudUid(event.id);
    const ics = buildIcsEvent({ uid, ...event });

    if (event.appleEventHref) {
      const { etag } = await this.apple.updateEvent(connection, event.appleEventHref, event.appleEventEtag, ics);
      await this.prisma.calendarEvent.update({ where: { id: event.id }, data: { appleEventEtag: etag } });
      return;
    }

    const calendarUrl = connection.writeCalendarUrl ?? connection.selectedCalendarUrls[0];
    if (!calendarUrl) throw new Error('iCloud 還沒選要寫入的日曆');
    const { url, etag } = await this.apple.createEvent(connection, calendarUrl, uid, ics);
    await this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: { appleEventUid: uid, appleEventHref: url, appleEventEtag: etag },
    });
  }
}
