import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { ScheduleService } from './schedule.service';
import type { WorkItem } from '../../generated/prisma/client.js';
import { CreateWorkItemDto } from './dto/create-work-item.dto';
import { UpdateWorkItemDto } from './dto/update-work-item.dto';
import { ReorderWorkItemDto } from './dto/reorder-work-item.dto';

@Injectable()
export class WorkItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly scheduleService: ScheduleService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    return this.prisma.workItem.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Every mutation below returns the fresh project+items+schedule bundle
   * (via `ScheduleService.buildEditorState`, reusing the `project` row
   * already fetched for the access check here) instead of just the raw
   * changed row — the schedule tab always needs the recomputed dates right
   * after an edit anyway, and previously had to make a *second* full
   * `getEditorState` round trip to get them, doubling both the network hop
   * and the repeated project/space/membership access-check queries on
   * every single edit action.
   */
  async create(userId: string, projectId: string, dto: CreateWorkItemDto) {
    const project = await this.getAuthorizedProject(userId, projectId);

    if (dto.parentId) {
      await this.getWorkItemOrThrow(projectId, dto.parentId);
    }

    const maxSortOrder = await this.prisma.workItem.aggregate({
      where: { projectId, parentId: dto.parentId ?? null },
      _max: { sortOrder: true },
    });

    const created = await this.prisma.workItem.create({
      data: {
        name: dto.name,
        durationDays: dto.durationDays,
        predecessorIds: dto.predecessorIds ?? [],
        tradeCategory: dto.tradeCategory,
        colorValue: dto.colorValue,
        progressPercent: dto.progressPercent ?? 0,
        notes: dto.notes,
        manualStartDate: dto.manualStartDate ? new Date(dto.manualStartDate) : null,
        isManuallyPinned: dto.isManuallyPinned ?? false,
        parentId: dto.parentId ?? null,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
        projectId,
      },
    });

    return { createdId: created.id, ...(await this.scheduleService.buildEditorState(project)) };
  }

  async update(
    userId: string,
    projectId: string,
    workItemId: string,
    dto: UpdateWorkItemDto,
  ) {
    const project = await this.getAuthorizedProject(userId, projectId);
    await this.getWorkItemOrThrow(projectId, workItemId);

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === workItemId) {
        throw new BadRequestException('工項不能是自己的母項目');
      }
      await this.getWorkItemOrThrow(projectId, dto.parentId);
    }

    await this.prisma.workItem.update({
      where: { id: workItemId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.durationDays !== undefined && {
          durationDays: dto.durationDays,
        }),
        ...(dto.actualDurationDays !== undefined && {
          actualDurationDays: dto.actualDurationDays,
        }),
        ...(dto.predecessorIds !== undefined && {
          predecessorIds: dto.predecessorIds,
        }),
        ...(dto.tradeCategory !== undefined && {
          tradeCategory: dto.tradeCategory,
        }),
        ...(dto.colorValue !== undefined && { colorValue: dto.colorValue }),
        ...(dto.progressPercent !== undefined && {
          progressPercent: dto.progressPercent,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.manualStartDate !== undefined && {
          manualStartDate: dto.manualStartDate ? new Date(dto.manualStartDate) : null,
        }),
        ...(dto.isManuallyPinned !== undefined && {
          isManuallyPinned: dto.isManuallyPinned,
        }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
    });

    return this.scheduleService.buildEditorState(project);
  }

  async remove(userId: string, projectId: string, workItemId: string) {
    const project = await this.getAuthorizedProject(userId, projectId);
    await this.getWorkItemOrThrow(projectId, workItemId);

    // No DB-level cascade on WorkItem's self-relation (Postgres rejects
    // multiple cascade paths into the same table) — walk descendants in
    // application code, mirroring reno_pm's project_provider.dart
    // removeWorkItem (BFS from the deleted root).
    const allItems = await this.prisma.workItem.findMany({
      where: { projectId },
    });
    const idsToDelete = collectDescendantIds(workItemId, allItems);
    await this.prisma.workItem.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    return this.scheduleService.buildEditorState(project);
  }

  async reorder(
    userId: string,
    projectId: string,
    workItemId: string,
    dto: ReorderWorkItemDto,
  ) {
    const project = await this.getAuthorizedProject(userId, projectId);

    const item = await this.getWorkItemOrThrow(projectId, workItemId);
    const target = await this.getWorkItemOrThrow(projectId, dto.targetId);

    if (item.parentId !== target.parentId) {
      throw new BadRequestException('只能在同一層工項之間排序');
    }

    const siblings = await this.prisma.workItem.findMany({
      where: { projectId, parentId: item.parentId },
      orderBy: { sortOrder: 'asc' },
    });

    const withoutItem = siblings.filter((s) => s.id !== workItemId);
    const targetIndex = withoutItem.findIndex((s) => s.id === dto.targetId);
    const insertIndex = dto.insertAfter ? targetIndex + 1 : targetIndex;
    withoutItem.splice(insertIndex, 0, item);

    await this.prisma.$transaction(
      withoutItem.map((sibling, index) =>
        this.prisma.workItem.update({
          where: { id: sibling.id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.scheduleService.buildEditorState(project);
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getWorkItemOrThrow(
    projectId: string,
    workItemId: string,
  ): Promise<WorkItem> {
    const item = await this.prisma.workItem.findUnique({
      where: { id: workItemId },
    });
    if (!item || item.projectId !== projectId) {
      throw new NotFoundException('Work item not found');
    }
    return item;
  }
}

function collectDescendantIds(rootId: string, allItems: WorkItem[]): string[] {
  const childrenByParent = new Map<string, WorkItem[]>();
  for (const item of allItems) {
    if (item.parentId) {
      if (!childrenByParent.has(item.parentId)) {
        childrenByParent.set(item.parentId, []);
      }
      childrenByParent.get(item.parentId)!.push(item);
    }
  }

  const result: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    for (const child of childrenByParent.get(id) ?? []) {
      queue.push(child.id);
    }
  }
  return result;
}
