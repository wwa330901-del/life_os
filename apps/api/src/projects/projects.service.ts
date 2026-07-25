import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { MembershipRole, ProjectRole, SpaceType } from '../../generated/prisma/client.js';
import type { Project } from '../../generated/prisma/client.js';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';

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
  async listForSpace(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    const canSeeEverything =
      space.role === MembershipRole.OWNER || space.role === MembershipRole.ADMIN;
    return this.prisma.project.findMany({
      where: canSeeEverything ? { spaceId } : { spaceId, members: { some: { userId } } },
      include: { type: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateProjectDto) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        clientName: dto.clientName,
        siteAddress: dto.siteAddress,
        caseNumber: dto.caseNumber,
        typeId: dto.typeId,
        statusId: dto.statusId,
        projectStartDate: new Date(dto.projectStartDate),
        spaceId,
      },
      include: { type: true, status: true },
    });
    // Whoever creates a project is its PM (project lead) by default.
    await this.prisma.projectMember.create({
      data: { userId, projectId: project.id, role: ProjectRole.PM },
    });
    return project;
  }

  async getOne(userId: string, projectId: string) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertAccess(userId, project);
    return project;
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertAccess(userId, project);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.clientName !== undefined && { clientName: dto.clientName }),
        ...(dto.siteAddress !== undefined && { siteAddress: dto.siteAddress }),
        ...(dto.caseNumber !== undefined && { caseNumber: dto.caseNumber }),
        ...(dto.typeId !== undefined && { typeId: dto.typeId }),
        ...(dto.statusId !== undefined && { statusId: dto.statusId }),
        ...(dto.projectStartDate !== undefined && {
          projectStartDate: new Date(dto.projectStartDate),
        }),
      },
      include: { type: true, status: true },
    });
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

  /** Every caller gets `type`/`status` included — it's a cheap join on a
   * single-row lookup, and centralizing it here means every screen that
   * loads a project (detail, schedule, work items, calendar) sees the same
   * shape without each one remembering to ask for it separately. */
  async getProjectOrThrow(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { type: true, status: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
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
