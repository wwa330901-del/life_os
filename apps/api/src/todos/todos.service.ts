import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { CalendarSyncTarget } from '../../generated/prisma/client.js';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

interface SyncableTodo {
  id: string;
  title: string;
  dueDate: Date | null;
  dueDateAllDay: boolean;
  isOngoing: boolean;
  personalOwnerUserId: string | null;
  calendarSyncTarget: CalendarSyncTarget | null;
}

/** 代辦事項 has no upper bound otherwise — completed items just kept
 * accumulating forever (same class of problem as the 知識庫 pagination fix,
 * see 大系統V1.43.0), except here the fix is UX-driven rather than purely
 * performance-driven: a completed item stops being useful in the live list
 * the moment it's checked off. `listAll` (the live view) excludes every
 * `done` item immediately (2026-08-05: changed from "stays visible through
 * the day it was completed" after the user tried that and found it
 * pointless — a same-day-completed item still cluttered the active list
 * all day); `listCompleted` (the 已完成 tab) is the paginated, searchable
 * place it goes to remain findable, effective immediately too. */
const COMPLETED_TODOS_PAGE_SIZE = 10;

/** 個人代辦事項 — owned directly by their creator, no project/company-space
 * concept involved (see schema comment on ProjectTodo for why the table is
 * still named that). */
@Injectable()
export class TodosService {
  private readonly logger = new Logger(TodosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarEventsService: CalendarEventsService,
  ) {}

  async listAll(userId: string) {
    // A completed item drops out of this live view the instant it's
    // checked off — see `listCompleted` for where it goes after that.
    const personal = await this.prisma.projectTodo.findMany({
      where: { personalOwnerUserId: userId, done: false },
      orderBy: [{ done: 'asc' }, { sortOrder: 'asc' }],
    });
    return { personal };
  }

  /** 已完成代辦事項 — full history, cursor-paginated 10/page with an
   * optional title search, replacing what used to just be the tail end of
   * `listAll`'s ever-growing list. */
  async listCompleted(
    userId: string,
    filter: { search?: string; cursor?: string } = {},
  ) {
    const take = COMPLETED_TODOS_PAGE_SIZE;

    const rows = await this.prisma.projectTodo.findMany({
      where: {
        done: true,
        personalOwnerUserId: userId,
        ...(filter.search ? { title: { contains: filter.search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async create(userId: string, dto: CreateTodoDto) {
    this.assertDueDateXorOngoing(dto.dueDate ?? null, dto.isOngoing ?? false);

    const todo = await this.prisma.projectTodo.create({
      data: {
        personalOwnerUserId: userId,
        title: dto.title,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        dueDateAllDay: dto.dueDateAllDay ?? true,
        isOngoing: dto.isOngoing ?? false,
        priority: dto.priority,
        notes: dto.notes,
        calendarSyncTarget: dto.calendarSyncTarget,
        sortOrder: await this.nextSortOrder(userId),
      },
    });
    await this.syncCalendarEvent(todo);
    return todo;
  }

  async update(userId: string, id: string, dto: UpdateTodoDto) {
    const existing = await this.getAuthorizedTodo(userId, id);

    // Only re-check the date/ongoing rule when this update actually
    // touches one of those two fields — an update that's e.g. only
    // toggling `done` shouldn't fail just because a pre-existing row
    // predates this rule and has neither set (see schema comment).
    if (dto.dueDate !== undefined || dto.isOngoing !== undefined) {
      const finalDueDate = dto.dueDate !== undefined ? dto.dueDate : existing.dueDate;
      const finalIsOngoing = dto.isOngoing !== undefined ? dto.isOngoing : existing.isOngoing;
      this.assertDueDateXorOngoing(finalDueDate, finalIsOngoing);
    }

    const justCompleted = dto.done === true && !existing.done;
    const justReopened = dto.done === false && existing.done;

    const todo = await this.prisma.projectTodo.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.done !== undefined && { done: dto.done }),
        ...(justCompleted && { completedAt: new Date() }),
        ...(justReopened && { completedAt: null }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        // 到期時間改了，到期前提醒要重新算。
        ...((dto.dueDate !== undefined || dto.dueDateAllDay !== undefined) && { dueReminderSentAt: null }),
        ...(dto.dueDateAllDay !== undefined && { dueDateAllDay: dto.dueDateAllDay }),
        ...(dto.isOngoing !== undefined && { isOngoing: dto.isOngoing }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.calendarSyncTarget !== undefined && { calendarSyncTarget: dto.calendarSyncTarget }),
      },
    });
    // 完成/取消完成、優先順序、備註都不影響行事曆那筆——只有會改變行事曆上
    // 看到的內容（時間、標題、存到哪個行事曆）才需要重新同步。
    if (
      dto.dueDate !== undefined ||
      dto.dueDateAllDay !== undefined ||
      dto.isOngoing !== undefined ||
      dto.title !== undefined ||
      dto.calendarSyncTarget !== undefined
    ) {
      await this.syncCalendarEvent(todo);
    }
    return todo;
  }

  /** Every todo needs exactly one of a due date or the 持續性任務 flag —
   * "pick one" not "either is fine, neither is fine too" (2026-08-03,
   * explicit user rule). Pre-existing rows that predate this rule are
   * left alone (see schema comment) — this only gate new creates/edits. */
  private assertDueDateXorOngoing(dueDate: string | Date | null | undefined, isOngoing: boolean) {
    const hasDueDate = dueDate != null;
    if (!hasDueDate && !isOngoing) {
      throw new BadRequestException('請選擇日期，或標記為持續性任務');
    }
    if (hasDueDate && isOngoing) {
      throw new BadRequestException('日期跟持續性任務只能選一個');
    }
  }

  async remove(userId: string, id: string) {
    await this.getAuthorizedTodo(userId, id);
    // Explicitly remove the synced event first (rather than relying on the
    // DB's onDelete: Cascade) so the Google-side delete actually fires —
    // a raw cascade delete only removes the local row, it can't reach
    // Google's API.
    const existing = await this.prisma.calendarEvent.findUnique({ where: { sourceTodoId: id } });
    if (existing) await this.removeSyncedEvent(existing);
    await this.prisma.projectTodo.delete({ where: { id } });
  }

  /** 代辦事項→行事曆 one-way sync (2026-08-05, explicit user request): a
   * todo with a due date/time gets a matching CalendarEvent in its owner's
   * 行事曆 space, kept in sync on every create/update. The reverse never
   * happens — editing the CalendarEvent directly never writes back to the
   * todo, and completing a todo deliberately leaves the calendar event
   * alone (explicit user choice — it's a historical record, not something
   * that should vanish just because the task is done). Best-effort: a sync
   * failure is logged and swallowed, never thrown back to the caller — a
   * todo write must never fail just because its calendar mirror couldn't
   * be made, same "must not block the primary action" philosophy as
   * `CalendarEventsService`'s own Google push. */
  private async syncCalendarEvent(todo: SyncableTodo): Promise<void> {
    try {
      const ownerUserId = todo.personalOwnerUserId;
      const existing = await this.prisma.calendarEvent.findUnique({
        where: { sourceTodoId: todo.id },
      });

      if (!ownerUserId || !todo.dueDate || todo.isOngoing) {
        if (existing) await this.removeSyncedEvent(existing);
        return;
      }

      const calendarSpace = await this.prisma.space.findUnique({
        where: { calendarOwnerUserId: ownerUserId },
      });
      if (!calendarSpace) {
        // No 行事曆 space yet (shouldn't normally happen — every user gets
        // one at signup) — nothing to sync into, and nothing to clean up
        // either since `ownerUserId` couldn't have created `existing` in
        // a space that doesn't exist.
        return;
      }

      const eventInput = {
        title: `📋 ${todo.title}`,
        startAt: todo.dueDate.toISOString(),
        allDay: todo.dueDateAllDay,
        notes: '同步自代辦事項，直接編輯這裡不會回寫代辦事項。',
        ...(todo.calendarSyncTarget && { syncTarget: todo.calendarSyncTarget }),
      };

      if (!existing) {
        await this.calendarEventsService.create(ownerUserId, calendarSpace.id, eventInput, todo.id);
        return;
      }

      if (existing.spaceId !== calendarSpace.id) {
        await this.removeSyncedEvent(existing);
        await this.calendarEventsService.create(ownerUserId, calendarSpace.id, eventInput, todo.id);
        return;
      }

      await this.calendarEventsService.update(ownerUserId, calendarSpace.id, existing.id, eventInput);
    } catch (error) {
      this.logger.warn(`代辦事項同步行事曆失敗 todo=${todo.id}`, error as Error);
    }
  }

  private async removeSyncedEvent(existing: { id: string; spaceId: string }): Promise<void> {
    const space = await this.prisma.space.findUnique({ where: { id: existing.spaceId } });
    if (!space?.calendarOwnerUserId) return;
    await this.calendarEventsService.remove(space.calendarOwnerUserId, existing.spaceId, existing.id);
  }

  private async nextSortOrder(personalOwnerUserId: string) {
    const maxSortOrder = await this.prisma.projectTodo.aggregate({
      where: { personalOwnerUserId },
      _max: { sortOrder: true },
    });
    return (maxSortOrder._max.sortOrder ?? -1) + 1;
  }

  private async getAuthorizedTodo(userId: string, id: string) {
    const todo = await this.prisma.projectTodo.findUnique({ where: { id } });
    if (!todo) {
      throw new NotFoundException('代辦事項不存在');
    }
    if (todo.personalOwnerUserId !== userId) {
      throw new ForbiddenException('You do not have access to this todo');
    }
    return todo;
  }
}
