import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
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

  async listForSpace(userId: string, spaceId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    return this.prisma.project.findMany({
      where: { spaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateProjectDto) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    return this.prisma.project.create({
      data: {
        name: dto.name,
        clientName: dto.clientName,
        siteAddress: dto.siteAddress,
        projectStartDate: new Date(dto.projectStartDate),
        spaceId,
      },
    });
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
        ...(dto.projectStartDate !== undefined && {
          projectStartDate: new Date(dto.projectStartDate),
        }),
      },
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

  async getProjectOrThrow(projectId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async assertAccess(userId: string, project: Project): Promise<void> {
    await this.spacesService.getForUserOrThrow(userId, project.spaceId);
  }
}
