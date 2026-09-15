import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  MembershipRole,
  PermissionAction,
  PermissionResourceType,
  Prisma,
  ProjectRole,
  ProjectStage,
  PropertyType,
  SpaceType,
} from '../../generated/prisma/client.js';
import type { Project } from '../../generated/prisma/client.js';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { PropertyValueInputDto } from './dto/property-value-input.dto';

const propertyValuesInclude = {
  propertyValues: { include: { definition: true, option: true } },
} as const;

/// Fixed forward order for `advanceStage` — see the `ProjectStage` enum
/// comment in schema.prisma for where this list comes from.
const STAGE_ORDER: ProjectStage[] = [
  ProjectStage.BUSINESS_CONTACT,
  ProjectStage.DESIGN_CONTRACT,
  ProjectStage.DESIGN_PHASE,
  ProjectStage.ENGINEERING_QUOTATION,
  ProjectStage.ENGINEERING_CONTRACT,
  ProjectStage.PREPARATION,
  ProjectStage.PROCUREMENT,
  ProjectStage.CONSTRUCTION,
  ProjectStage.COMPLETION_SETTLEMENT,
];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly permissionsService: PermissionsService,
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
      space.role === MembershipRole.OWNER ||
      space.role === MembershipRole.ADMIN;
    const projects = await this.prisma.project.findMany({
      where: canSeeEverything
        ? { spaceId }
        : { spaceId, members: { some: { userId } } },
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
    // PermissionsService.can/assertCan auto-bypasses non-COMPANY spaces
    // (personal spaces have no department/rank concept at all) — safe to
    // call unconditionally here.
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.PROJECT,
      PermissionAction.WRITE,
    );
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
        await this.upsertPropertyValues(
          tx,
          project.id,
          spaceId,
          dto.propertyValues,
        );
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
    await this.assertCanWrite(userId, project);
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
          ...(dto.caseType !== undefined && { caseType: dto.caseType }),
          ...(dto.skipDesignPhase !== undefined && {
            skipDesignPhase: dto.skipDesignPhase,
          }),
        },
      });
      if (dto.propertyValues?.length) {
        await this.upsertPropertyValues(
          tx,
          projectId,
          project.spaceId,
          dto.propertyValues,
        );
      }
    });
    return this.getProjectOrThrow(projectId);
  }

  async remove(userId: string, projectId: string) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertCanWrite(userId, project);
    // WorkItem.projectId has onDelete: Cascade, so this takes every work
    // item with it.
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  async updateCalendar(
    userId: string,
    projectId: string,
    dto: UpdateCalendarDto,
  ) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertCanWrite(userId, project);
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
   * each one remembering to ask for it separately. */
  async getProjectOrThrow(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: propertyValuesInclude,
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  /** Moves a project to the next stage in `STAGE_ORDER`. Manual-only, one
   * step forward at a time (2026-09 user decision — no auto-advance, no
   * jumping, no going back through this endpoint). If `skipDesignPhase` is
   * on and the next stage would be DESIGN_PHASE, steps one further to
   * ENGINEERING_QUOTATION instead — DESIGN_CONTRACT still happens either
   * way, only the DESIGN_PHASE stage itself is skipped. */
  async advanceStage(userId: string, projectId: string) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertCanWrite(userId, project);

    const currentIndex = STAGE_ORDER.indexOf(project.stage);
    if (currentIndex === STAGE_ORDER.length - 1) {
      throw new BadRequestException('已經是最後階段（完工驗收・結算保固）');
    }
    let nextIndex = currentIndex + 1;
    if (
      project.skipDesignPhase &&
      STAGE_ORDER[nextIndex] === ProjectStage.DESIGN_PHASE
    ) {
      nextIndex += 1;
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { stage: STAGE_ORDER[nextIndex] },
    });
    return this.getProjectOrThrow(projectId);
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
      } = {
        textValue: null,
        numberValue: null,
        dateValue: null,
        optionId: null,
      };

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
        where: {
          projectId_definitionId: { projectId, definitionId: definition.id },
        },
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
    const space = await this.spacesService.getForUserOrThrow(
      userId,
      project.spaceId,
    );
    if (space.type === SpaceType.PERSONAL) return;
    if (
      space.role === MembershipRole.OWNER ||
      space.role === MembershipRole.ADMIN
    )
      return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId: project.id } },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }

  /** `assertAccess` (read) plus the 2026-09 PROJECT/WRITE permission-engine
   * check (see PermissionsService) — call this instead of `assertAccess`
   * wherever the caller is about to mutate a project, its work items
   * (工期表), or its member roster. PermissionsService.can/assertCan
   * auto-bypasses non-COMPANY spaces, so this is safe to call unconditionally
   * even for a personal-space project. */
  async assertCanWrite(userId: string, project: Project): Promise<void> {
    await this.assertAccess(userId, project);
    await this.permissionsService.assertCan(
      userId,
      project.spaceId,
      PermissionResourceType.PROJECT,
      PermissionAction.WRITE,
    );
  }
}
