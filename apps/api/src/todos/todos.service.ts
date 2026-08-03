import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

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
    const [personal, memberships] = await Promise.all([
      this.prisma.projectTodo.findMany({
        where: { personalOwnerUserId: userId },
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
          where: { projectId: { in: projectIds } },
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

  async create(userId: string, dto: CreateTodoDto) {
    if (!dto.projectId) {
      return this.prisma.projectTodo.create({
        data: {
          personalOwnerUserId: userId,
          title: dto.title,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
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
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.assigneeUserId !== undefined && { assigneeUserId: dto.assigneeUserId }),
      },
    });
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
