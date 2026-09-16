import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { EngineeringQuotationService } from './engineering-quotation.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  PermissionAction,
  PermissionResourceType,
} from '../../generated/prisma/client.js';
import type { OwnerBillingPeriod } from '../../generated/prisma/client.js';
import { CreateOwnerBillingPeriodDto } from './dto/create-owner-billing-period.dto';
import { UpdateOwnerBillingPeriodDto } from './dto/update-owner-billing-period.dto';

/**
 * 業主端估驗計價——見 schema.prisma 的 OwnerBillingPeriod 說明。跟
 * PaymentRequestPeriod（對廠商）的差異：掛在 Project 底下不綁
 * CostControlRow、金額手動輸入不自動試算、不走簽核（純記錄/匯出），也因
 * 此支援 update/delete（PaymentRequestPeriod 只能 create，鎖定靠簽核；這
 * 裡沒有簽核可鎖，就直接允許編輯/刪除既有期別）。權限沿用既有
 * PAYMENT_REQUEST resourceType——概念上是同一組「請款」動作的業主端半
 * 邊，不新增獨立的 resourceType。
 */
@Injectable()
export class OwnerBillingPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly quotationService: EngineeringQuotationService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    return this.prisma.ownerBillingPeriod.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreateOwnerBillingPeriodDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);

    const { contractAmount, billedPercent } = await this.getContractSnapshot(
      userId,
      projectId,
    );

    return this.prisma.ownerBillingPeriod.create({
      data: {
        projectId,
        periodLabel: dto.periodLabel,
        amount: dto.amount,
        requestDate: new Date(dto.requestDate),
        note: dto.note,
        contractAmountSnapshot: contractAmount,
        billedPercentBefore: billedPercent,
        createdByUserId: userId,
      },
    });
  }

  async update(
    userId: string,
    projectId: string,
    periodId: string,
    dto: UpdateOwnerBillingPeriodDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    await this.getPeriodOrThrow(projectId, periodId);
    return this.prisma.ownerBillingPeriod.update({
      where: { id: periodId },
      data: {
        ...(dto.periodLabel !== undefined && { periodLabel: dto.periodLabel }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.requestDate !== undefined && {
          requestDate: new Date(dto.requestDate),
        }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });
  }

  async remove(userId: string, projectId: string, periodId: string) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    await this.getPeriodOrThrow(projectId, periodId);
    await this.prisma.ownerBillingPeriod.delete({ where: { id: periodId } });
  }

  /** 標記已收款（2026-09，顧問文件財務系統「應收帳款 View」子項）——這張
   * 表本來就沒有簽核鎖定，可以隨時標記/取消標記。 */
  async markCollected(userId: string, projectId: string, periodId: string) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    await this.getPeriodOrThrow(projectId, periodId);
    return this.prisma.ownerBillingPeriod.update({
      where: { id: periodId },
      data: { collectedDate: new Date() },
    });
  }

  /** 目前報價單總金額（業主合約總額），跟這個專案至今所有既有期別金額的
   * 累計占比——跟 PaymentRequestPeriod 建立時算 contractAmountSnapshot/
   * billedPercentBefore 同一個邏輯，只是基準從單一發包的成控列換成整個專
   * 案的報價單總計。 */
  private async getContractSnapshot(userId: string, projectId: string) {
    const { grandTotal } = await this.quotationService.getTree(
      userId,
      projectId,
    );
    const priorSum = await this.prisma.ownerBillingPeriod.aggregate({
      where: { projectId },
      _sum: { amount: true },
    });
    const billed = priorSum._sum.amount ?? 0;
    return {
      contractAmount: grandTotal,
      billedPercent: grandTotal > 0 ? billed / grandTotal : 0,
    };
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getAuthorizedProjectForWrite(
    userId: string,
    projectId: string,
  ) {
    const project = await this.getAuthorizedProject(userId, projectId);
    await this.permissionsService.assertCan(
      userId,
      project.spaceId,
      PermissionResourceType.PAYMENT_REQUEST,
      PermissionAction.WRITE,
    );
    return project;
  }

  private async getPeriodOrThrow(
    projectId: string,
    periodId: string,
  ): Promise<OwnerBillingPeriod> {
    const period = await this.prisma.ownerBillingPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period || period.projectId !== projectId) {
      throw new NotFoundException('Owner billing period not found');
    }
    return period;
  }
}
