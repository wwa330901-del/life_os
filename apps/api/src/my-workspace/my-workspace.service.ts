import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { taipeiTodayRange } from '../common/taipei-date';
import { mondayOfTaipeiWeek } from '../projects/weekly-reports.service';
import {
  MaterialSubmissionStatus,
  ProjectRole,
} from '../../generated/prisma/client.js';

/**
 * 個人工作站（2026-09，顧問文件橫向基礎建設 A 的子項）——這是個人視角的
 * 唯讀彙總，不受 OWNER-only 限制，任何公司空間成員都能看自己的。三個區
 * 塊：自己是 PM 的專案（含今日日報/本週週報是否已交）、自己名下未完成
 * 的工作代辦、自己名下待審核的材料送審——因為 MaterialSubmission 的審
 * 核權限比照 assertCanWrite（沒有獨立的審核者角色），這裡用「自己是這
 * 個專案的 PM」當作「該審核」的判斷依據，是我自己選的合理近似，不是使
 * 用者確認過的規則。
 */
@Injectable()
export class MyWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
  ) {}

  async get(userId: string, spaceId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);

    const today = taipeiTodayRange().start;
    const weekStart = mondayOfTaipeiWeek(today);

    const myProjectMemberships = await this.prisma.projectMember.findMany({
      where: {
        userId,
        role: ProjectRole.PM,
        project: { spaceId },
      },
      include: {
        project: {
          include: {
            dailyReports: { where: { reportDate: today } },
            weeklyReports: { where: { weekStartDate: weekStart } },
          },
        },
      },
    });
    const myProjects = myProjectMemberships.map((m) => ({
      projectId: m.project.id,
      projectName: m.project.name,
      stage: m.project.stage,
      dailyReportSubmittedToday: m.project.dailyReports.length > 0,
      weeklyReportSubmittedThisWeek: m.project.weeklyReports.length > 0,
    }));

    const myTodos = await this.prisma.projectTodo.findMany({
      where: {
        assigneeUserId: userId,
        done: false,
        project: { spaceId },
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
    });

    const myProjectIds = myProjectMemberships.map((m) => m.project.id);
    const myPendingReviews = myProjectIds.length
      ? await this.prisma.materialSubmission.findMany({
          where: {
            status: MaterialSubmissionStatus.PENDING,
            projectId: { in: myProjectIds },
          },
          include: {
            project: { select: { id: true, name: true } },
            submittedBy: { select: { name: true } },
          },
          orderBy: { submittedDate: 'asc' },
        })
      : [];

    return {
      myProjects,
      myTodos: myTodos.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        projectId: t.project?.id ?? null,
        projectName: t.project?.name ?? null,
      })),
      myPendingReviews: myPendingReviews.map((s) => ({
        id: s.id,
        materialName: s.materialName,
        submittedDate: s.submittedDate,
        projectId: s.project.id,
        projectName: s.project.name,
        submittedByName: s.submittedBy.name,
      })),
    };
  }
}
