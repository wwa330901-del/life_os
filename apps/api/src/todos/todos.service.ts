import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

/** 代辦事項 has no upper bound otherwise — completed items just kept
 * accumulating forever (same class of problem as the 知識庫 pagination fix,
 * see 大系統V1.43.0), except here the fix is UX-driven rather than purely
 * performance-driven: a completed item stops being useful in the live list
 * the moment it's checked off. `listAll` (the 個人/工作 live view) excludes
 * every `done` item immediately (2026-08-05: changed from "stays visible
 * through the day it was completed" after the user tried that and found it
 * pointless — a same-day-completed item still cluttered the active list
 * all day); `listCompleted` (the 已完成 tab) is the paginated, searchable
 * place it goes to remain findable, effective immediately too. */
const COMPLETED_TODOS_PAGE_SIZE = 10;

/** 代辦事項 — split into 個人 (owned directly by a user, no project at all)
 * and 工作 (owned by a company-space project, same as the old project-scoped
 * todos). Both live in the same `ProjectTodo` table (see schema comment),
 * this service is just the one place that knows how to tell them apart and
 * enforce access for each. */
@Injectable()
export class TodosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Grouped view for the top-level 代辦事項 screen: 個人 as one flat list,
   * 工作 as one list per project the user belongs to. */
  async listAll(userId: string) {
    // A completed item drops out of this live view the instant it's
    // checked off — see `listCompleted` for where it goes after that.
    const visibleDone = { done: false };

    const [personal, memberships] = await Promise.all([
      this.prisma.projectTodo.findMany({
        where: { personalOwnerUserId: userId, ...visibleDone },
        orderBy: [{ done: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.projectMember.findMany({
        where: { userId },
        include: { project: { include: { space: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const projectIds = memberships.map((m) => m.projectId);
    const workTodos = projectIds.length
      ? await this.prisma.projectTodo.findMany({
          where: { projectId: { in: projectIds }, ...visibleDone },
          orderBy: [{ done: 'asc' }, { sortOrder: 'asc' }],
        })
      : [];
    const todosByProject = new Map<string, typeof workTodos>();
    for (const todo of workTodos) {
      const list = todosByProject.get(todo.projectId!) ?? [];
      list.push(todo);
      todosByProject.set(todo.projectId!, list);
    }

    const work = memberships.map((m) => ({
      projectId: m.projectId,
      projectName: m.project.name,
      spaceName: m.project.space.name,
      todos: todosByProject.get(m.projectId) ?? [],
    }));

    return { personal, work };
  }

  /** 已完成代辦事項 — full history (個人 + 工作 combined, no date limit),
   * cursor-paginated 10/page with an optional title search, replacing what
   * used to just be the tail end of `listAll`'s ever-growing list. */
  async listCompleted(
    userId: string,
    filter: { search?: string; cursor?: string } = {},
  ) {
    const take = COMPLETED_TODOS_PAGE_SIZE;
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    const projectIds = memberships.map((m) => m.projectId);

    const rows = await this.prisma.projectTodo.findMany({
      where: {
        done: true,
        OR: [{ personalOwnerUserId: userId }, { projectId: { in: projectIds } }],
        ...(filter.search ? { title: { contains: filter.search, mode: 'insensitive' } } : {}),
      },
      include: { project: { include: { space: true } } },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map(({ project, ...todo }) => ({
        ...todo,
        projectName: project?.name ?? null,
        spaceName: project?.space.name ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async create(userId: string, dto: CreateTodoDto) {
    this.assertDueDateXorOngoing(dto.dueDate ?? null, dto.isOngoing ?? false);

    if (!dto.projectId) {
      return this.prisma.projectTodo.create({
        data: {
          personalOwnerUserId: userId,
          title: dto.title,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          isOngoing: dto.isOngoing ?? false,
          priority: dto.priority,
          notes: dto.notes,
          sortOrder: await this.nextSortOrder({ personalOwnerUserId: userId }),
        },
      });
    }

    const project = await this.getAuthorizedProject(userId, dto.projectId);
    if (dto.assigneeUserId) {
      await this.assertProjectMember(project.id, dto.assigneeUserId);
    }
    return this.prisma.projectTodo.create({
      data: {
        projectId: project.id,
        title: dto.title,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        isOngoing: dto.isOngoing ?? false,
        priority: dto.priority,
        notes: dto.notes,
        assigneeUserId: dto.assigneeUserId,
        sortOrder: await this.nextSortOrder({ projectId: project.id }),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTodoDto) {
    const existing = await this.getAuthorizedTodo(userId, id);
    if (dto.assigneeUserId && existing.projectId) {
      await this.assertProjectMember(existing.projectId, dto.assigneeUserId);
    }

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

    return this.prisma.projectTodo.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.done !== undefined && { done: dto.done }),
        ...(justCompleted && { completedAt: new Date() }),
        ...(justReopened && { completedAt: null }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.isOngoing !== undefined && { isOngoing: dto.isOngoing }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.assigneeUserId !== undefined && { assigneeUserId: dto.assigneeUserId }),
      },
    });
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
    await this.prisma.projectTodo.delete({ where: { id } });
  }

  private async nextSortOrder(where: { projectId: string } | { personalOwnerUserId: string }) {
    const maxSortOrder = await this.prisma.projectTodo.aggregate({
      where,
      _max: { sortOrder: true },
    });
    return (maxSortOrder._max.sortOrder ?? -1) + 1;
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getAuthorizedTodo(userId: string, id: string) {
    const todo = await this.prisma.projectTodo.findUnique({ where: { id } });
    if (!todo) {
      throw new NotFoundException('代辦事項不存在');
    }
    if (todo.personalOwnerUserId) {
      if (todo.personalOwnerUserId !== userId) {
        throw new ForbiddenException('You do not have access to this todo');
      }
      return todo;
    }
    const project = await this.projectsService.getProjectOrThrow(todo.projectId!);
    await this.projectsService.assertAccess(userId, project);
    return todo;
  }

  private async assertProjectMember(projectId: string, userId: string) {
    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (!membership) {
      throw new BadRequestException('指派對象不是這個專案的成員');
    }
  }
}
