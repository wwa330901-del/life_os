import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { SpacesService } from '../spaces/spaces.service';
import { isWorkingDay } from './scheduling/holiday-calendar';
import { taipeiTodayRange } from '../common/taipei-date';
import { ProjectRole, SpaceType } from '../../generated/prisma/client.js';
import type { DailyReport } from '../../generated/prisma/client.js';
import { SubmitDailyReportDto } from './dto/submit-daily-report.dto';

/**
 * 工程日報表——見 schema.prisma 的 DailyReport 說明。任何專案成員都能
 * 填，一個專案一天只有一筆（同一天重複送出視為覆蓋）。「未交」判斷跳過
 * 這個專案自己的公休日曆。
 */
@Injectable()
export class DailyReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly spacesService: SpacesService,
  ) {}

  async list(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return this.prisma.dailyReport.findMany({
      where: { projectId },
      include: { submittedBy: { select: { name: true } } },
      orderBy: { reportDate: 'desc' },
    });
  }

  /** Upserts by [projectId, reportDate] — a second submission for the same
   * day overwrites the first rather than creating a second row, matching
   * "任何專案成員都能填" without needing per-member rows. */
  async submit(userId: string, projectId: string, dto: SubmitDailyReportDto) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);

    const reportDate = dto.reportDate
      ? new Date(dto.reportDate)
      : taipeiTodayRange().start;

    return this.prisma.dailyReport.upsert({
      where: { projectId_reportDate: { projectId, reportDate } },
      create: {
        projectId,
        reportDate,
        workContent: dto.workContent,
        manpower: dto.manpower,
        issues: dto.issues,
        submittedByUserId: userId,
      },
      update: {
        workContent: dto.workContent,
        manpower: dto.manpower,
        issues: dto.issues,
        submittedByUserId: userId,
      },
    });
  }

  async remove(userId: string, projectId: string, reportId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);
    const report = await this.getReportOrThrow(projectId, reportId);
    await this.prisma.dailyReport.delete({ where: { id: report.id } });
  }

  /** 今日未交日報的專案清單（跳過公休日、跳過非公司空間）——空間層級彙總
   * 用途，見 SpaceDailyReportsController。跟 DailyReportReminderService
   * 的每日 8pm 推播算同一套邏輯，只是這裡是即時查詢給畫面看，不是排程
   * 推播。 */
  async listMissingToday(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    if (space.type !== SpaceType.COMPANY) return [];

    const today = taipeiTodayRange().start;
    const projects = await this.prisma.project.findMany({
      where: { spaceId },
      include: {
        members: {
          where: { role: ProjectRole.PM },
          include: { user: { select: { name: true } } },
        },
        dailyReports: { where: { reportDate: today } },
      },
    });

    return projects
      .filter((p) => isWorkingDay(today, p) && p.dailyReports.length === 0)
      .map((p) => ({
        projectId: p.id,
        projectName: p.name,
        pmName: p.members[0]?.user.name ?? null,
      }));
  }

  private async getReportOrThrow(
    projectId: string,
    reportId: string,
  ): Promise<DailyReport> {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id: reportId },
    });
    if (!report || report.projectId !== projectId) {
      throw new NotFoundException('Daily report not found');
    }
    return report;
  }
}
