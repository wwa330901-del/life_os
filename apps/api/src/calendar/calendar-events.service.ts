import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarAccessService } from './calendar-access.service';
import { GoogleCalendarService } from './google-calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { UpdateCalendarEventOccurrenceDto } from './dto/update-calendar-event-occurrence.dto';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight, utcDateKey } from '../common/taipei-date';
import { dateKeyBefore, expandSeriesOccurrences } from './calendar-recurrence';
import { CalendarRecurrenceFrequency } from '../../generated/prisma/client.js';
import type { CalendarEvent } from '../../generated/prisma/client.js';

@Injectable()
export class CalendarEventsService {
  private readonly logger = new Logger(CalendarEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
    private readonly google: GoogleCalendarService,
  ) {}

  /** Plain (non-recurring) events in range, plus every recurring series'
   * generated occurrences in range (see calendar-recurrence.ts) merged in —
   * a series never shows up as its own single row here, only as whichever
   * occurrences of it land inside `[from, to)`. Recurring series are only
   * expanded when BOTH `from`/`to` are given (every real caller — the App's
   * month view, the AI assistant's date-range tool — always supplies both);
   * without a bound there's no safe window to expand into, so recurring
   * events are simply omitted rather than guessing one. */
  async list(userId: string, spaceId: string, from?: string, to?: string) {
    await this.access.assertCalendarSpace(userId, spaceId);
    return this.listForSpace(spaceId, from, to);
  }

  /** Space-scoped, no user-authorization check of its own — `list()` above
   * does that for "my own calendar"; `CalendarSharesService.combinedEvents`
   * is the other caller, for a shared owner's space, where the relevant
   * authorization is an accepted `CalendarShare` grant instead of
   * `CalendarAccessService.assertCalendarSpace`. */
  async listForSpace(spaceId: string, from?: string, to?: string) {
    const plain = await this.prisma.calendarEvent.findMany({
      where: {
        spaceId,
        recurrenceFrequency: CalendarRecurrenceFrequency.NONE,
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
    const plainMapped = plain.map((e) => this.plainEventShape(e));

    if (!from || !to) return plainMapped;

    const rangeFromKey = taipeiDateKey(new Date(from));
    const rangeToKey = taipeiDateKey(new Date(to));

    const series = await this.prisma.calendarEvent.findMany({
      where: {
        spaceId,
        recurrenceFrequency: { not: CalendarRecurrenceFrequency.NONE },
        startAt: { lt: new Date(to) },
        OR: [{ recurrenceUntil: null }, { recurrenceUntil: { gte: new Date(from) } }],
      },
    });
    if (series.length === 0) return plainMapped;

    const exceptions = await this.prisma.calendarEventException.findMany({
      where: { seriesId: { in: series.map((s) => s.id) } },
    });
    const exceptionsBySeriesId = new Map<string, typeof exceptions>();
    for (const ex of exceptions) {
      const list = exceptionsBySeriesId.get(ex.seriesId) ?? [];
      list.push(ex);
      exceptionsBySeriesId.set(ex.seriesId, list);
    }

    const occurrences = series.flatMap((s) => {
      const seriesExceptions = (exceptionsBySeriesId.get(s.id) ?? []).map((ex) => ({
        ...ex,
        occurrenceDateKey: utcDateKey(ex.occurrenceDate),
      }));
      return expandSeriesOccurrences(s, seriesExceptions, rangeFromKey, rangeToKey).map((occ) => ({
        id: occ.exceptionId ?? `${s.id}#${occ.occurrenceDateKey}`,
        spaceId,
        title: occ.title,
        startAt: occ.startAt,
        endAt: occ.endAt,
        allDay: occ.allDay,
        location: occ.location,
        notes: occ.notes,
        googleEventId: null,
        sourceTodoId: null,
        recurrenceFrequency: s.recurrenceFrequency,
        recurrenceUntil: s.recurrenceUntil,
        seriesId: s.id,
        occurrenceDate: occ.occurrenceDateKey,
      }));
    });

    return [...plainMapped, ...occurrences].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  /** `sourceTodoId` is internal-only (never part of the public
   * `CreateCalendarEventDto`/HTTP surface) — set only by
   * `TodosService`'s 代辦事項→行事曆 one-way sync. A todo never has a
   * recurrence concept, so a synced event is always `recurrenceFrequency:
   * NONE` by construction (the caller never passes recurrence fields
   * alongside `sourceTodoId`). */
  async create(userId: string, spaceId: string, dto: CreateCalendarEventDto, sourceTodoId?: string) {
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
        recurrenceFrequency: dto.recurrenceFrequency ?? CalendarRecurrenceFrequency.NONE,
        recurrenceUntil: dto.recurrenceUntil ? new Date(dto.recurrenceUntil) : null,
        ...(sourceTodoId && { sourceTodoId }),
      },
    });
    this.pushToGoogleInBackground(spaceId, event);
    return event;
  }

  /** Edits the series/event ROW directly — for a plain event this is just
   * "the edit"; for a recurring series this is the 全部 (ALL) scope (every
   * occurrence, past exceptions untouched since they're still valid
   * deviations against the — possibly now different — base pattern). */
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
        ...(dto.recurrenceFrequency !== undefined && { recurrenceFrequency: dto.recurrenceFrequency }),
        ...(dto.recurrenceUntil !== undefined && {
          recurrenceUntil: dto.recurrenceUntil ? new Date(dto.recurrenceUntil) : null,
        }),
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

  /** Google Calendar-style 只改這次／這次以後／全部 edit scope for one
   * occurrence of a recurring series:
   * - ALL — delegates straight to `update()` (edits the series row).
   * - THIS — upserts a `CalendarEventException` for just this date. The
   *   exception, once written, is a COMPLETE standalone snapshot (every
   *   dto-omitted field falls back to the occurrence's CURRENT effective
   *   values — existing exception if any, else the series' generated
   *   default — resolved once here, not re-derived on every read).
   * - FOLLOWING — editing the series' own first occurrence is just editing
   *   the whole series (nothing precedes it), so that degenerates to ALL.
   *   Otherwise: truncates the original series' `recurrenceUntil` to the
   *   day before this occurrence, creates a brand new series starting here
   *   with the edited fields, and reparents any exceptions dated on/after
   *   this occurrence onto the new series (the one dated exactly on this
   *   occurrence, if any, is dropped — the new series' own base row
   *   replaces it). */
  async updateOccurrence(
    userId: string,
    spaceId: string,
    seriesId: string,
    dto: UpdateCalendarEventOccurrenceDto,
  ) {
    await this.access.assertCalendarSpace(userId, spaceId);
    const series = await this.getOrThrow(spaceId, seriesId);
    if (series.recurrenceFrequency === CalendarRecurrenceFrequency.NONE) {
      throw new BadRequestException('這不是循環事件，請直接編輯');
    }

    const occurrenceDateKey = taipeiDateKey(new Date(dto.occurrenceDate));
    this.assertOccurrenceInSeries(series, occurrenceDateKey);

    if (dto.scope === 'ALL') {
      return this.update(userId, spaceId, seriesId, dto);
    }

    const anchorKey = taipeiDateKey(series.startAt);

    if (dto.scope === 'THIS') {
      const occurrenceDate = taipeiDateKeyToUtcMidnight(occurrenceDateKey);
      const existingException = await this.prisma.calendarEventException.findUnique({
        where: { seriesId_occurrenceDate: { seriesId, occurrenceDate } },
      });
      const [generated] = expandSeriesOccurrences(series, [], occurrenceDateKey, dateKeyAfter(occurrenceDateKey));
      const currentTitle = existingException?.title ?? generated.title;
      const currentStartAt = existingException?.startAt ?? generated.startAt;
      const currentEndAt = existingException ? existingException.endAt : generated.endAt;
      const currentAllDay = existingException?.allDay ?? generated.allDay;
      const currentLocation = existingException ? existingException.location : generated.location;
      const currentNotes = existingException ? existingException.notes : generated.notes;

      await this.prisma.calendarEventException.upsert({
        where: { seriesId_occurrenceDate: { seriesId, occurrenceDate } },
        create: {
          seriesId,
          occurrenceDate,
          cancelled: false,
          title: dto.title ?? currentTitle,
          startAt: dto.startAt ? new Date(dto.startAt) : currentStartAt,
          endAt: dto.endAt !== undefined ? (dto.endAt ? new Date(dto.endAt) : null) : currentEndAt,
          allDay: dto.allDay ?? currentAllDay,
          location: dto.location !== undefined ? dto.location : currentLocation,
          notes: dto.notes !== undefined ? dto.notes : currentNotes,
        },
        update: {
          cancelled: false,
          title: dto.title ?? currentTitle,
          startAt: dto.startAt ? new Date(dto.startAt) : currentStartAt,
          endAt: dto.endAt !== undefined ? (dto.endAt ? new Date(dto.endAt) : null) : currentEndAt,
          allDay: dto.allDay ?? currentAllDay,
          location: dto.location !== undefined ? dto.location : currentLocation,
          notes: dto.notes !== undefined ? dto.notes : currentNotes,
        },
      });
      return { ok: true };
    }

    // scope === 'FOLLOWING'
    if (occurrenceDateKey === anchorKey) {
      return this.update(userId, spaceId, seriesId, dto);
    }

    const splitBoundaryKey = dateKeyBefore(occurrenceDateKey);
    await this.prisma.calendarEvent.update({
      where: { id: seriesId },
      data: { recurrenceUntil: taipeiDateKeyToUtcMidnight(splitBoundaryKey) },
    });

    const [generated] = expandSeriesOccurrences(series, [], occurrenceDateKey, dateKeyAfter(occurrenceDateKey));
    const occurrenceDate = taipeiDateKeyToUtcMidnight(occurrenceDateKey);
    const newSeries = await this.prisma.calendarEvent.create({
      data: {
        spaceId,
        title: dto.title ?? generated.title,
        startAt: dto.startAt ? new Date(dto.startAt) : generated.startAt,
        endAt: dto.endAt !== undefined ? (dto.endAt ? new Date(dto.endAt) : null) : generated.endAt,
        allDay: dto.allDay ?? generated.allDay,
        location: dto.location !== undefined ? dto.location : generated.location,
        notes: dto.notes !== undefined ? dto.notes : generated.notes,
        recurrenceFrequency: dto.recurrenceFrequency ?? series.recurrenceFrequency,
        recurrenceUntil:
          dto.recurrenceUntil !== undefined
            ? dto.recurrenceUntil
              ? new Date(dto.recurrenceUntil)
              : null
            : series.recurrenceUntil,
      },
    });

    await this.prisma.calendarEventException.deleteMany({ where: { seriesId, occurrenceDate } });
    await this.prisma.calendarEventException.updateMany({
      where: { seriesId, occurrenceDate: { gt: occurrenceDate } },
      data: { seriesId: newSeries.id },
    });

    return newSeries;
  }

  /** Delete-side counterpart to `updateOccurrence` — same three scopes,
   * same split/reparent mechanics for FOLLOWING, minus creating a
   * replacement series (a delete just cuts the future off, nothing new to
   * anchor). */
  async removeOccurrence(
    userId: string,
    spaceId: string,
    seriesId: string,
    occurrenceDateRaw: string,
    scope: 'THIS' | 'FOLLOWING' | 'ALL',
  ) {
    await this.access.assertCalendarSpace(userId, spaceId);
    const series = await this.getOrThrow(spaceId, seriesId);
    if (series.recurrenceFrequency === CalendarRecurrenceFrequency.NONE) {
      throw new BadRequestException('這不是循環事件，請直接刪除');
    }

    const occurrenceDateKey = taipeiDateKey(new Date(occurrenceDateRaw));
    this.assertOccurrenceInSeries(series, occurrenceDateKey);

    if (scope === 'ALL') {
      return this.remove(userId, spaceId, seriesId);
    }

    if (scope === 'THIS') {
      const occurrenceDate = taipeiDateKeyToUtcMidnight(occurrenceDateKey);
      await this.prisma.calendarEventException.upsert({
        where: { seriesId_occurrenceDate: { seriesId, occurrenceDate } },
        create: { seriesId, occurrenceDate, cancelled: true },
        update: {
          cancelled: true,
          title: null,
          startAt: null,
          endAt: null,
          allDay: null,
          location: null,
          notes: null,
        },
      });
      return;
    }

    // scope === 'FOLLOWING'
    const anchorKey = taipeiDateKey(series.startAt);
    if (occurrenceDateKey === anchorKey) {
      return this.remove(userId, spaceId, seriesId);
    }

    const splitBoundaryKey = dateKeyBefore(occurrenceDateKey);
    const occurrenceDate = taipeiDateKeyToUtcMidnight(occurrenceDateKey);
    await this.prisma.calendarEvent.update({
      where: { id: seriesId },
      data: { recurrenceUntil: taipeiDateKeyToUtcMidnight(splitBoundaryKey) },
    });
    await this.prisma.calendarEventException.deleteMany({
      where: { seriesId, occurrenceDate: { gte: occurrenceDate } },
    });
  }

  private assertOccurrenceInSeries(series: CalendarEvent, occurrenceDateKey: string): void {
    const anchorKey = taipeiDateKey(series.startAt);
    if (occurrenceDateKey < anchorKey) {
      throw new BadRequestException('這個日期在循環事件開始之前');
    }
    if (series.recurrenceUntil && occurrenceDateKey > taipeiDateKey(series.recurrenceUntil)) {
      throw new BadRequestException('這個日期已經超過循環事件的結束日');
    }
  }

  private plainEventShape(event: CalendarEvent) {
    return {
      ...event,
      seriesId: null as string | null,
      occurrenceDate: null as string | null,
    };
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
   * periodic sync reconciles it on the next pass. A recurring series
   * (`recurrenceFrequency !== NONE`) never gets pushed — Google's own
   * RRULE/per-occurrence-exception model isn't wired up on this side, out
   * of scope for this round; it stays purely a local, App-only feature. */
  private pushToGoogleInBackground(spaceId: string, event: CalendarEvent): void {
    if (event.recurrenceFrequency !== CalendarRecurrenceFrequency.NONE) return;
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

function dateKeyAfter(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}
