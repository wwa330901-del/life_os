import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { CreateProjectTodoDto } from './dto/create-project-todo.dto';
import { UpdateProjectTodoDto } from './dto/update-project-todo.dto';

@Injectable()
export class ProjectTodosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    return this.prisma.projectTodo.findMany({
      where: { projectId },
      orderBy: [{ done: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async create(userId: string, projectId: string, dto: CreateProjectTodoDto) {
    await this.getAuthorizedProject(userId, projectId);
    if (dto.assigneeUserId) {
      await this.assertProjectMember(projectId, dto.assigneeUserId);
    }
    const maxSortOrder = await this.prisma.projectTodo.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    });
    return this.prisma.projectTodo.create({
      data: {
        projectId,
        title: dto.title,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        priority: dto.priority,
        notes: dto.notes,
        assigneeUserId: dto.assigneeUserId,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async update(userId: string, projectId: string, id: string, dto: UpdateProjectTodoDto) {
    await this.getAuthorizedProject(userId, projectId);
    const existing = await this.getOrThrow(projectId, id);
    if (dto.assigneeUserId) {
      await this.assertProjectMember(projectId, dto.assigneeUserId);
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

  async remove(userId: string, projectId: string, id: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getOrThrow(projectId, id);
    await this.prisma.projectTodo.delete({ where: { id } });
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getOrThrow(projectId: string, id: string) {
    const todo = await this.prisma.projectTodo.findUnique({ where: { id } });
    if (!todo || todo.projectId !== projectId) {
      throw new NotFoundException('Project todo not found');
    }
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
