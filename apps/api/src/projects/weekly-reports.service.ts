import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { SpacesService } from '../spaces/spaces.service';
import { taipeiTodayRange } from '../common/taipei-date';
import { ProjectRole, SpaceType } from '../../generated/prisma/client.js';
import type { WeeklyReport } from '../../generated/prisma/client.js';
import { SubmitWeeklyReportDto } from './dto/submit-weekly-report.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 週一 (Asia/Taipei) 的 UTC 午夜——正規化任何落在同一週的日期到同一個
 * key，同 DailyReport 的 reportDate 是曆日 key 的作法。輸入/輸出都跟
 * `taipeiTodayRange().start` 同一種形狀（代表 Taipei 曆日的 UTC 午夜)。 */
export function mondayOfTaipeiWeek(taipeiDateMidnightUtc: Date): Date {
  const isoWeekday = taipeiDateMidnightUtc.getUTCDay() || 7; // 1=Mon..7=Sun
  return new Date(taipeiDateMidnightUtc.getTime() - (isoWeekday - 1) * DAY_MS);
}

/**
 * 工程週報表——見 schema.prisma 的 WeeklyReport 說明。跟日報表同一套
 * upsert 慣例，一個專案一週一筆，key 是該週週一。
 */
@Injectable()
export class WeeklyReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly spacesService: SpacesService,
  ) {}

  async list(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return this.prisma.weeklyReport.findMany({
      where: { projectId },
      include: { submittedBy: { select: { name: true } } },
      orderBy: { weekStartDate: 'desc' },
    });
  }

  /** Upserts by [projectId, weekStartDate] — a second submission for the
   * same week overwrites the first, matching DailyReportsService.submit. */
  async submit(userId: string, projectId: string, dto: SubmitWeeklyReportDto) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);

    const anchor = dto.weekStartDate
      ? new Date(dto.weekStartDate)
      : taipeiTodayRange().start;
    const weekStartDate = mondayOfTaipeiWeek(anchor);

    return this.prisma.weeklyReport.upsert({
      where: { projectId_weekStartDate: { projectId, weekStartDate } },
      create: {
        projectId,
        weekStartDate,
        summary: dto.summary,
        nextWeekPlan: dto.nextWeekPlan,
        issues: dto.issues,
        submittedByUserId: userId,
      },
      update: {
        summary: dto.summary,
        nextWeekPlan: dto.nextWeekPlan,
        issues: dto.issues,
        submittedByUserId: userId,
      },
    });
  }

  async remove(userId: string, projectId: string, reportId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);
    const report = await this.getReportOrThrow(projectId, reportId);
    await this.prisma.weeklyReport.delete({ where: { id: report.id } });
  }

  /** 本週還沒交週報的專案清單（跳過非公司空間）——空間層級彙總用途，見
   * SpaceWeeklyReportsController，跟 WeeklyReportReminderService 的每週
   * 五推播算同一套邏輯，只是這裡是即時查詢給畫面看。不像日報表要逐日檢
   * 查公休日，週報只看「這週的 weekStartDate 有沒有一筆記錄」。 */
  async listMissingThisWeek(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    if (space.type !== SpaceType.COMPANY) return [];

    const weekStartDate = mondayOfTaipeiWeek(taipeiTodayRange().start);
    const projects = await this.prisma.project.findMany({
      where: { spaceId },
      include: {
        members: {
          where: { role: ProjectRole.PM },
          include: { user: { select: { name: true } } },
        },
        weeklyReports: { where: { weekStartDate } },
      },
    });

    return projects
      .filter((p) => p.weeklyReports.length === 0)
      .map((p) => ({
        projectId: p.id,
        projectName: p.name,
        pmName: p.members[0]?.user.name ?? null,
      }));
  }

  private async getReportOrThrow(
    projectId: string,
    reportId: string,
  ): Promise<WeeklyReport> {
    const report = await this.prisma.weeklyReport.findUnique({
      where: { id: reportId },
    });
    if (!report || report.projectId !== projectId) {
      throw new NotFoundException('Weekly report not found');
    }
    return report;
  }
}
