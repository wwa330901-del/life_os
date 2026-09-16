import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { DailyReportsService } from '../projects/daily-reports.service';
import { mondayOfTaipeiWeek } from '../projects/weekly-reports.service';
import { EngineeringQuotationService } from '../engineering-finance/engineering-quotation.service';
import { ReceivablesPayablesService } from '../engineering-finance/receivables-payables.service';
import { taipeiTodayRange } from '../common/taipei-date';
import {
  MaterialSubmissionStatus,
  MembershipRole,
  ProjectRole,
  ProjectStage,
  SpaceType,
} from '../../generated/prisma/client.js';

/**
 * 監控儀表板（2026-09，顧問文件唯一整個模組空白的項目）——純唯讀彙總畫
 * 面，不新增任何使用者要手動填的資料表，四種角色視角對應四個獨立查詢
 * 區塊，互不依賴：其中一個算失敗不讓整支 API 掛掉（catch 後回傳該區塊
 * 的空/預設值，用 Logger 記錄，不拋給呼叫端）。只有 OWNER/ADMIN/這個空
 * 間的總經理（Space.generalManagerUserId）能看，其餘角色 403。
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly dailyReportsService: DailyReportsService,
    private readonly quotationService: EngineeringQuotationService,
    private readonly receivablesPayablesService: ReceivablesPayablesService,
  ) {}

  async get(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    if (space.type !== SpaceType.COMPANY) {
      throw new ForbiddenException('監控儀表板只適用於公司空間');
    }
    const allowed =
      space.role === MembershipRole.OWNER ||
      space.role === MembershipRole.ADMIN ||
      space.generalManagerUserId === userId;
    if (!allowed) {
      throw new ForbiddenException('您沒有權限查看監控儀表板');
    }

    const [generalManagerView, departmentView, projectView, dataAnalysisView] =
      await Promise.all([
        this.getGeneralManagerView(userId, spaceId).catch((error) => {
          this.logger.error('總經理視角區塊算失敗', error);
          return null;
        }),
        this.getDepartmentView(spaceId).catch((error) => {
          this.logger.error('部門視角區塊算失敗', error);
          return null;
        }),
        this.getProjectView(spaceId).catch((error) => {
          this.logger.error('專案視角區塊算失敗', error);
          return null;
        }),
        this.getDataAnalysisView(userId, spaceId).catch((error) => {
          this.logger.error('數據分析視角區塊算失敗', error);
          return null;
        }),
      ]);

    return {
      generalManagerView,
      departmentView,
      projectView,
      dataAnalysisView,
    };
  }

  private async getGeneralManagerView(userId: string, spaceId: string) {
    const projectsByStage = await this.prisma.project.groupBy({
      by: ['stage'],
      where: { spaceId },
      _count: { _all: true },
    });
    const missingToday = await this.dailyReportsService.listMissingToday(
      userId,
      spaceId,
    );
    const pendingMaterialSubmissions =
      await this.prisma.materialSubmission.count({
        where: {
          status: MaterialSubmissionStatus.PENDING,
          project: { spaceId },
        },
      });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentFieldChanges = await this.prisma.fieldChangeLog.count({
      where: { spaceId, changedAt: { gte: thirtyDaysAgo } },
    });

    return {
      projectCountByStage: Object.fromEntries(
        Object.values(ProjectStage).map((stage) => [
          stage,
          projectsByStage.find((p) => p.stage === stage)?._count._all ?? 0,
        ]),
      ),
      missingDailyReportProjectCount: missingToday.length,
      pendingMaterialSubmissionCount: pendingMaterialSubmissions,
      recentFieldChangeCount: recentFieldChanges,
    };
  }

  private async getDepartmentView(spaceId: string) {
    const departments = await this.prisma.department.findMany({
      where: { spaceId },
      orderBy: { sortOrder: 'asc' },
      include: { memberships: { select: { userId: true } } },
    });

    return Promise.all(
      departments.map(async (dept) => {
        const memberUserIds = dept.memberships.map((m) => m.userId);
        const pmProjectCount = memberUserIds.length
          ? await this.prisma.project.count({
              where: {
                spaceId,
                members: {
                  some: { userId: { in: memberUserIds }, role: ProjectRole.PM },
                },
              },
            })
          : 0;
        return {
          departmentId: dept.id,
          departmentName: dept.name,
          memberCount: memberUserIds.length,
          pmProjectCount,
        };
      }),
    );
  }

  private async getProjectView(spaceId: string) {
    const today = taipeiTodayRange().start;
    const weekStart = mondayOfTaipeiWeek(today);

    const projects = await this.prisma.project.findMany({
      where: { spaceId },
      include: {
        members: {
          where: { role: ProjectRole.PM },
          include: { user: { select: { name: true } } },
        },
        dailyReports: { where: { reportDate: today } },
        weeklyReports: { where: { weekStartDate: weekStart } },
      },
      orderBy: { name: 'asc' },
    });

    return projects.map((p) => ({
      projectId: p.id,
      projectName: p.name,
      stage: p.stage,
      caseType: p.caseType,
      pmName: p.members[0]?.user.name ?? null,
      dailyReportSubmittedToday: p.dailyReports.length > 0,
      weeklyReportSubmittedThisWeek: p.weeklyReports.length > 0,
    }));
  }

  /** 三個金額加總並陳——報價單用 quotationService.getTree() 現算的
   * grandTotal，逐專案呼叫；單一專案算失敗（例如總經理剛好不是那個專案
   * 的成員，assertAccess 拒絕）不影響其他專案，靜默跳過並記錄。 */
  private async getDataAnalysisView(userId: string, spaceId: string) {
    const projects = await this.prisma.project.findMany({
      where: { spaceId },
      select: { id: true },
    });

    let totalQuotationGrandTotal = 0;
    for (const project of projects) {
      try {
        const { grandTotal } = await this.quotationService.getTree(
          userId,
          project.id,
        );
        totalQuotationGrandTotal += grandTotal;
      } catch (error) {
        this.logger.warn(
          `專案 ${project.id} 的報價單總額算失敗，跳過`,
          error as Error,
        );
      }
    }

    const ownerBillingSum = await this.prisma.ownerBillingPeriod.aggregate({
      where: { project: { spaceId } },
      _sum: { amount: true },
    });
    const paymentRequestSum = await this.prisma.paymentRequestPeriod.aggregate({
      where: { costControlRow: { project: { spaceId } } },
      _sum: { amount: true },
    });
    const receivablesPayables = await this.receivablesPayablesService.get(
      userId,
      spaceId,
    );

    return {
      totalQuotationGrandTotal,
      totalOwnerBillingAmount: ownerBillingSum._sum.amount ?? 0,
      totalPaymentRequestAmount: paymentRequestSum._sum.amount ?? 0,
      totalReceivableOutstanding:
        receivablesPayables.totalReceivableOutstanding,
      totalPayableOutstanding: receivablesPayables.totalPayableOutstanding,
    };
  }
}
