import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { PermissionsService } from '../permissions/permissions.service';
import { taipeiTodayRange } from '../common/taipei-date';
import { mondayOfTaipeiWeek } from '../projects/weekly-reports.service';
import {
  MaterialSubmissionStatus,
  MembershipRole,
  PermissionAction,
  PermissionResourceType,
  ProjectRole,
} from '../../generated/prisma/client.js';

/**
 * 個人工作站（2026-09，顧問文件橫向基礎建設 A 的子項）——這是個人視角的
 * 唯讀彙總，不受 OWNER-only 限制，任何公司空間成員都能看自己的。三個區
 * 塊：自己是 PM 的專案（含今日日報/本週週報是否已交）、自己名下未完成
 * 的工作代辦、自己「可以審核」的材料送審。
 *
 * 「可以審核」直接比照 `MaterialSubmissionsService.review` 實際呼叫的
 * `ProjectsService.assertCanWrite`（assertAccess 的專案成員資格 + PROJECT/
 * WRITE 權限），不再用「自己是這個專案的 PM」近似——那個近似會漏掉「有
 * 寫入權限但不是 PM」的一般專案成員，也會誤收「是 PM 但沒有 WRITE 權限」
 * 的人。OWNER/ADMIN 對空間裡每個專案都算有權限；其餘人的 PROJECT/WRITE
 * 是整個空間層級的單一規則（不分專案），只要通過就對自己是成員的每個專
 * 案都算有審核資格。
 */
@Injectable()
export class MyWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async get(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);

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

    const isOwnerOrAdmin =
      space.role === MembershipRole.OWNER ||
      space.role === MembershipRole.ADMIN;
    const canWriteProjects =
      isOwnerOrAdmin ||
      (await this.permissionsService.can(
        userId,
        spaceId,
        PermissionResourceType.PROJECT,
        PermissionAction.WRITE,
      ));
    const reviewableProjectIds = !canWriteProjects
      ? []
      : isOwnerOrAdmin
        ? (
            await this.prisma.project.findMany({
              where: { spaceId },
              select: { id: true },
            })
          ).map((p) => p.id)
        : (
            await this.prisma.projectMember.findMany({
              where: { userId, project: { spaceId } },
              select: { projectId: true },
            })
          ).map((m) => m.projectId);

    const myPendingReviews = reviewableProjectIds.length
      ? await this.prisma.materialSubmission.findMany({
          where: {
            status: MaterialSubmissionStatus.PENDING,
            projectId: { in: reviewableProjectIds },
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
