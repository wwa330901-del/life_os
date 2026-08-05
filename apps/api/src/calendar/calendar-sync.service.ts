import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService, type GoogleCalendarEventRemote } from './google-calendar.service';

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarService,
  ) {}

  /** Best-effort background pass over every connected calendar space —
   * catches up any inbound Google-side changes and retries any local
   * events that failed to push earlier, for whenever nobody happens to
   * have the calendar screen open (Render's free tier only runs this
   * while the app is awake, so it's a supplement to the on-open sync in
   * `syncSpace`, not the only mechanism). */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAllConnectedSpaces() {
    const connections = await this.prisma.googleCalendarConnection.findMany();
    for (const connection of connections) {
      try {
        await this.syncSpace(connection.spaceId);
      } catch (error) {
        this.logger.warn(`背景同步空間 ${connection.spaceId} 失敗：${error}`);
      }
    }
  }

  /** Pulls Google-side changes into local `CalendarEvent` rows, then
   * pushes any local events still missing a `googleEventId` (created
   * while disconnected, or whose earlier push failed). No-op if this
   * space has no Google connection. */
  async syncSpace(spaceId: string): Promise<void> {
    const connection = await this.prisma.googleCalendarConnection.findUnique({ where: { spaceId } });
    if (!connection) return;

    const { events, nextSyncToken } = await this.google.listChanges(connection, connection.syncToken);
    for (const remote of events) {
      await this.applyRemoteEvent(spaceId, remote);
    }
    await this.prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { syncToken: nextSyncToken, lastSyncedAt: new Date() },
    });

    // Recurring series (行事曆循環事件, 2026-08-05) are never pushed — see
    // CalendarEventsService.pushToGoogleInBackground's doc comment.
    const unpushed = await this.prisma.calendarEvent.findMany({
      where: { spaceId, googleEventId: null, recurrenceFrequency: 'NONE' },
    });
    for (const local of unpushed) {
      try {
        const googleEventId = await this.google.insertEvent(connection, {
          title: local.title,
          location: local.location,
          notes: local.notes,
          startAt: local.startAt,
          endAt: local.endAt,
          allDay: local.allDay,
        });
        await this.prisma.calendarEvent.update({ where: { id: local.id }, data: { googleEventId } });
      } catch (error) {
        this.logger.warn(`重試推送本機事件 ${local.id} 到 Google 失敗：${error}`);
      }
    }
  }

  private async applyRemoteEvent(spaceId: string, remote: GoogleCalendarEventRemote): Promise<void> {
    const existing = await this.prisma.calendarEvent.findUnique({
      where: { spaceId_googleEventId: { spaceId, googleEventId: remote.id } },
    });

    if (remote.status === 'cancelled') {
      if (existing) await this.prisma.calendarEvent.delete({ where: { id: existing.id } });
      return;
    }

    const allDay = Boolean(remote.start?.date);
    const startAt = new Date(remote.start?.date ?? remote.start?.dateTime ?? Date.now());
    const endAt = remote.end ? new Date(remote.end.date ?? remote.end.dateTime ?? startAt.toISOString()) : null;
    const data = {
      title: remote.summary ?? '（無標題）',
      location: remote.location ?? null,
      notes: remote.description ?? null,
      startAt,
      endAt,
      allDay,
    };

    if (existing) {
      await this.prisma.calendarEvent.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.calendarEvent.create({ data: { ...data, spaceId, googleEventId: remote.id } });
    }
  }
}
