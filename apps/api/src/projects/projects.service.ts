import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { MembershipRole, Prisma, ProjectRole, PropertyType, SpaceType } from '../../generated/prisma/client.js';
import type { Project } from '../../generated/prisma/client.js';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { PropertyValueInputDto } from './dto/property-value-input.dto';

const propertyValuesInclude = {
  propertyValues: { include: { definition: true, option: true } },
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
  ) {}

  /**
   * OWNER/ADMIN see every project in the space, same as before this
   * feature existed; a regular MEMBER only sees projects they've actually
   * been added to (see `assertAccess` for the same rule applied to a
   * single project).
   */
  /** Flat cross-space list of every project this user is a direct member
   * of — for pickers that need "any project of mine" regardless of which
   * company space it's in (e.g. 記帳's 代墊-to-project link), unlike
   * `listForSpace` which is always scoped to one already-known space. */
  async listForUser(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: { include: { space: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      spaceName: m.project.space.name,
    }));
  }

  async listForSpace(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    const canSeeEverything =
      space.role === MembershipRole.OWNER || space.role === MembershipRole.ADMIN;
    const projects = await this.prisma.project.findMany({
      where: canSeeEverything ? { spaceId } : { spaceId, members: { some: { userId } } },
      include: {
        ...propertyValuesInclude,
        // Only the PM(s) — the project list card just needs "who's
        // responsible", not the full member list (see
        // ProjectMembersController for that).
        members: {
          where: { role: ProjectRole.PM },
          include: { user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return projects.map(({ members, ...project }) => ({
      ...project,
      pmName: members[0]?.user.name ?? null,
    }));
  }

  async create(userId: string, spaceId: string, dto: CreateProjectDto) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    // One transaction: a bad property value (e.g. an unparseable number)
    // must not leave behind a half-created project with no PM and no
    // values — either all of this lands, or none of it does.
    const projectId = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          projectStartDate: new Date(dto.projectStartDate),
          spaceId,
        },
      });
      if (dto.propertyValues?.length) {
        await this.upsertPropertyValues(tx, project.id, spaceId, dto.propertyValues);
      }
      // Whoever creates a project is its PM (project lead) by default.
      await tx.projectMember.create({
        data: { userId, projectId: project.id, role: ProjectRole.PM },
      });
      return project.id;
    });
    return this.getProjectOrThrow(projectId);
  }

  async getOne(userId: string, projectId: string) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertAccess(userId, project);
    return project;
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertAccess(userId, project);
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.projectStartDate !== undefined && {
            projectStartDate: new Date(dto.projectStartDate),
          }),
          ...(dto.projectEndDate !== undefined && {
            projectEndDate: new Date(dto.projectEndDate),
          }),
        },
      });
      if (dto.propertyValues?.length) {
        await this.upsertPropertyValues(tx, projectId, project.spaceId, dto.propertyValues);
      }
    });
    return this.getProjectOrThrow(projectId);
  }

  async remove(userId: string, projectId: string) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertAccess(userId, project);
    // WorkItem.projectId has onDelete: Cascade, so this takes every work
    // item with it.
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  async updateCalendar(userId: string, projectId: string, dto: UpdateCalendarDto) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertAccess(userId, project);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.weeklyOffDays !== undefined && {
          weeklyOffDays: dto.weeklyOffDays,
        }),
        ...(dto.useTaiwanGovernmentCalendar !== undefined && {
          useTaiwanGovernmentCalendar: dto.useTaiwanGovernmentCalendar,
        }),
        ...(dto.adHocHolidays !== undefined && {
          adHocHolidays: dto.adHocHolidays.map((s) => new Date(s)),
        }),
        ...(dto.adHocWorkdays !== undefined && {
          adHocWorkdays: dto.adHocWorkdays.map((s) => new Date(s)),
        }),
      },
    });
  }

  /** Every caller gets `propertyValues` (with each value's own definition
   * + chosen option) included — it's a cheap join on a single-row lookup,
   * and centralizing it here means every screen that loads a project
   * (detail, schedule, work items, calendar) sees the same shape without
   * each one remembering to ask for it separately. `type`/`status` (the
   * old fixed fields) are still included too — stage-1 safety net, not
   * used by the frontend anymore. */
  async getProjectOrThrow(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { type: true, status: true, ...propertyValuesInclude },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  /**
   * Writes/overwrites this project's value for each given property
   * definition — dispatches to the right column (textValue/numberValue/
   * dateValue/optionId) based on the definition's own stored `type`,
   * rejecting anything that doesn't parse as that type or (for SELECT) a
   * valid option belonging to the same definition.
   */
  private async upsertPropertyValues(
    tx: Prisma.TransactionClient,
    projectId: string,
    spaceId: string,
    inputs: PropertyValueInputDto[],
  ): Promise<void> {
    for (const input of inputs) {
      const definition = await tx.projectPropertyDefinition.findUnique({
        where: { id: input.definitionId },
      });
      if (!definition || definition.spaceId !== spaceId) {
        throw new BadRequestException(`屬性不存在:${input.definitionId}`);
      }

      const data: {
        textValue: string | null;
        numberValue: number | null;
        dateValue: Date | null;
        optionId: string | null;
      } = { textValue: null, numberValue: null, dateValue: null, optionId: null };

      switch (definition.type) {
        case PropertyType.TEXT:
          data.textValue = String(input.value);
          break;
        case PropertyType.NUMBER: {
          const num = Number(input.value);
          if (Number.isNaN(num)) {
            throw new BadRequestException(`「${definition.name}」需要數字`);
          }
          data.numberValue = num;
          break;
        }
        case PropertyType.DATE: {
          const date = new Date(String(input.value));
          if (Number.isNaN(date.getTime())) {
            throw new BadRequestException(`「${definition.name}」日期格式錯誤`);
          }
          data.dateValue = date;
          break;
        }
        case PropertyType.SELECT: {
          const option = await tx.projectPropertyOption.findUnique({
            where: { id: String(input.value) },
          });
          if (!option || option.definitionId !== definition.id) {
            throw new BadRequestException(`「${definition.name}」的選項不存在`);
          }
          data.optionId = option.id;
          break;
        }
      }

      await tx.projectPropertyValue.upsert({
        where: { projectId_definitionId: { projectId, definitionId: definition.id } },
        create: { projectId, definitionId: definition.id, ...data },
        update: data,
      });
    }
  }

  /**
   * Every project-scoped endpoint (work items, schedule, calendar, member
   * management) funnels through here — this is the one place that decides
   * who can touch a given project. Space OWNER/ADMIN always pass (they
   * need oversight of everything in their own company space); a regular
   * MEMBER additionally needs a `ProjectMember` row on this specific
   * project. Personal spaces have no project-membership concept (only
   * their owner can ever reach one), so they skip straight through once
   * space-level access is confirmed.
   */
  async assertAccess(userId: string, project: Project): Promise<void> {
    const space = await this.spacesService.getForUserOrThrow(userId, project.spaceId);
    if (space.type === SpaceType.PERSONAL) return;
    if (space.role === MembershipRole.OWNER || space.role === MembershipRole.ADMIN) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId: project.id } },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }
}
