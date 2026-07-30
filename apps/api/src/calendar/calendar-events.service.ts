import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarAccessService } from './calendar-access.service';
import { GoogleCalendarService } from './google-calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import type { CalendarEvent } from '../../generated/prisma/client.js';

@Injectable()
export class CalendarEventsService {
  private readonly logger = new Logger(CalendarEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
    private readonly google: GoogleCalendarService,
  ) {}

  async list(userId: string, spaceId: string, from?: string, to?: string) {
    await this.access.assertCalendarSpace(userId, spaceId);
    return this.prisma.calendarEvent.findMany({
      where: {
        spaceId,
        ...(from || to
          ? {
              startAt: {
                ...(from && { gte: new Date(from) }),
                ...(to && { lte: new Date(to) }),
              },
            }
          : {}),
      },
      orderBy: { startAt: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateCalendarEventDto) {
    await this.access.assertCalendarSpace(userId, spaceId);
    const event = await this.prisma.calendarEvent.create({
      data: {
        spaceId,
        title: dto.title,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        allDay: dto.allDay ?? false,
        location: dto.location,
        notes: dto.notes,
      },
    });
    this.pushToGoogleInBackground(spaceId, event);
    return event;
  }

  async update(userId: string, spaceId: string, id: string, dto: UpdateCalendarEventDto) {
    await this.access.assertCalendarSpace(userId, spaceId);
    await this.getOrThrow(spaceId, id);

    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt !== undefined && { endAt: dto.endAt ? new Date(dto.endAt) : null }),
        ...(dto.allDay !== undefined && { allDay: dto.allDay }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    this.pushToGoogleInBackground(spaceId, event);
    return event;
  }

  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertCalendarSpace(userId, spaceId);
    const existing = await this.getOrThrow(spaceId, id);
    await this.prisma.calendarEvent.delete({ where: { id } });

    if (existing.googleEventId) {
      const connection = await this.prisma.googleCalendarConnection.findUnique({ where: { spaceId } });
      if (connection) {
        this.google.deleteEvent(connection, existing.googleEventId).catch((error) => {
          this.logger.warn(`推送刪除到 Google Calendar 失敗（本機已刪除）：${error}`);
        });
      }
    }
  }

  private async getOrThrow(spaceId: string, id: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event || event.spaceId !== spaceId) {
      throw new NotFoundException('Calendar event not found');
    }
    return event;
  }

  /** Pushes a create/update to Google if this space is connected — not
   * awaited by the caller, so a slow (or down) Google API never adds
   * latency to the response the user is waiting on for their own edit
   * (this app already had one real "every edit takes seconds" bug from
   * synchronous round-trips before — see 工期表 schedule-save fix). A
   * failure here just leaves `googleEventId` unset (or stale); the
   * periodic sync reconciles it on the next pass. */
  private pushToGoogleInBackground(spaceId: string, event: CalendarEvent): void {
    this.prisma.googleCalendarConnection
      .findUnique({ where: { spaceId } })
      .then(async (connection) => {
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
      })
      .catch((error) => {
        this.logger.warn(`推送到 Google Calendar 失敗（本機已儲存，等待下次同步重試）：${error}`);
      });
  }
}
