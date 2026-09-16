import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import type { ProjectContactRecord } from '../../generated/prisma/client.js';
import { CreateContactRecordDto } from './dto/create-contact-record.dto';
import { UpdateContactRecordDto } from './dto/update-contact-record.dto';

/**
 * 聯絡單與會議記錄——見 schema.prisma 的 ProjectContactRecord 說明。純
 * CRUD 隨手記錄，不是週期性繳交，不像日報表/週報表有 reminder service。
 */
@Injectable()
export class ContactRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return this.prisma.projectContactRecord.findMany({
      where: { projectId },
      include: { createdBy: { select: { name: true } } },
      orderBy: { recordDate: 'desc' },
    });
  }

  async create(userId: string, projectId: string, dto: CreateContactRecordDto) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);
    return this.prisma.projectContactRecord.create({
      data: {
        projectId,
        type: dto.type,
        recordDate: new Date(dto.recordDate),
        title: dto.title,
        content: dto.content,
        attendees: dto.attendees,
        createdByUserId: userId,
      },
      include: { createdBy: { select: { name: true } } },
    });
  }

  async update(
    userId: string,
    projectId: string,
    recordId: string,
    dto: UpdateContactRecordDto,
  ) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);
    await this.getRecordOrThrow(projectId, recordId);
    return this.prisma.projectContactRecord.update({
      where: { id: recordId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.recordDate !== undefined && {
          recordDate: new Date(dto.recordDate),
        }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.attendees !== undefined && { attendees: dto.attendees }),
      },
      include: { createdBy: { select: { name: true } } },
    });
  }

  async remove(userId: string, projectId: string, recordId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);
    const record = await this.getRecordOrThrow(projectId, recordId);
    await this.prisma.projectContactRecord.delete({ where: { id: record.id } });
  }

  private async getRecordOrThrow(
    projectId: string,
    recordId: string,
  ): Promise<ProjectContactRecord> {
    const record = await this.prisma.projectContactRecord.findUnique({
      where: { id: recordId },
    });
    if (!record || record.projectId !== projectId) {
      throw new NotFoundException('Contact record not found');
    }
    return record;
  }
}
