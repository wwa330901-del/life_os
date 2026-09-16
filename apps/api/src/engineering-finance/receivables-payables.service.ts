import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';

/**
 * 應收應付帳款 View（2026-09，顧問文件財務系統子項）——純唯讀彙總，不落
 * 地存任何欄位。應收（跟業主）用 OwnerBillingPeriod.collectedDate 判斷
 * 已收/未收；應付（跟廠商）用 PaymentRequestPeriod.paidDate 判斷已付/
 * 未付——兩個欄位都是這輪新增的（見 schema.prisma），現有資料一律視為
 * 未收/未付（沒有回溯標記機制，符合「新增欄位不影響既有資料」的預期）。
 */
@Injectable()
export class ReceivablesPayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
  ) {}

  async get(userId: string, spaceId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);

    const billingPeriods = await this.prisma.ownerBillingPeriod.findMany({
      where: { project: { spaceId } },
      include: { project: { select: { id: true, name: true } } },
    });
    const receivablesByProject = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        billed: number;
        collected: number;
      }
    >();
    for (const period of billingPeriods) {
      const entry = receivablesByProject.get(period.projectId) ?? {
        projectId: period.projectId,
        projectName: period.project.name,
        billed: 0,
        collected: 0,
      };
      entry.billed += period.amount;
      if (period.collectedDate) entry.collected += period.amount;
      receivablesByProject.set(period.projectId, entry);
    }

    const paymentPeriods = await this.prisma.paymentRequestPeriod.findMany({
      where: { costControlRow: { project: { spaceId } } },
      include: {
        costControlRow: {
          include: { project: { select: { id: true, name: true } } },
        },
      },
    });
    const payablesByProject = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        requested: number;
        paid: number;
      }
    >();
    for (const period of paymentPeriods) {
      const project = period.costControlRow.project;
      const entry = payablesByProject.get(project.id) ?? {
        projectId: project.id,
        projectName: project.name,
        requested: 0,
        paid: 0,
      };
      entry.requested += period.amount;
      if (period.paidDate) entry.paid += period.amount;
      payablesByProject.set(project.id, entry);
    }

    const receivables = [...receivablesByProject.values()].map((r) => ({
      ...r,
      outstanding: r.billed - r.collected,
    }));
    const payables = [...payablesByProject.values()].map((p) => ({
      ...p,
      outstanding: p.requested - p.paid,
    }));

    return {
      receivables,
      payables,
      totalReceivableOutstanding: receivables.reduce(
        (sum, r) => sum + r.outstanding,
        0,
      ),
      totalPayableOutstanding: payables.reduce(
        (sum, p) => sum + p.outstanding,
        0,
      ),
    };
  }
}
