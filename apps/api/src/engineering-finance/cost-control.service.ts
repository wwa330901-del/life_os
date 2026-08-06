import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { DocumentApprovalStatus } from '../../generated/prisma/client.js';
import type { CostControlRow, QuotationLineItem } from '../../generated/prisma/client.js';
import { CreateCostControlRowDto } from './dto/create-cost-control-row.dto';
import { UpdateCostControlRowDto } from './dto/update-cost-control-row.dto';
import { ReorderCostControlRowDto } from './dto/reorder-cost-control-row.dto';
import { SetCostControlRowItemsDto } from './dto/set-cost-control-row-items.dto';
import { CreateCostControlAdjustmentDto } from './dto/create-cost-control-adjustment.dto';

const includeRowDetail = {
  quotationItems: { include: { quotationLineItem: true } },
  adjustments: { orderBy: { createdAt: 'asc' as const } },
  procurementComparison: true,
  paymentRequests: true,
};

/**
 * 成控管制表一列 = 一個實際發包。業主報價/預估成本從勾選的報價單工項加總
 * 現算（不落地存），實際發包從連結的採發比價表決標金額帶入，追加/追減是
 * 歷史紀錄加總，累計已請款從這列底下已核准的請款單加總——全部是讀取時現算,
 * 同一套「自我修復/不落地存衍生值」慣例，改工項勾選或合約金額不用另外補
 * 一支同步腳本。
 */
@Injectable()
export class CostControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const rows = await this.prisma.costControlRow.findMany({
      where: { projectId },
      include: includeRowDetail,
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => this.summarize(row));
  }

  async create(userId: string, projectId: string, dto: CreateCostControlRowDto) {
    await this.getAuthorizedProject(userId, projectId);
    if (dto.procurementComparisonId) {
      await this.getComparisonOrThrow(projectId, dto.procurementComparisonId);
    }

    const maxSortOrder = await this.prisma.costControlRow.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    });

    const created = await this.prisma.costControlRow.create({
      data: {
        projectId,
        name: dto.name,
        procurementComparisonId: dto.procurementComparisonId,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
      include: includeRowDetail,
    });
    return this.summarize(created);
  }

  async update(userId: string, projectId: string, rowId: string, dto: UpdateCostControlRowDto) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);
    if (dto.procurementComparisonId) {
      await this.getComparisonOrThrow(projectId, dto.procurementComparisonId);
    }

    const updated = await this.prisma.costControlRow.update({
      where: { id: rowId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.procurementComparisonId !== undefined && {
          procurementComparisonId: dto.procurementComparisonId,
        }),
      },
      include: includeRowDetail,
    });
    return this.summarize(updated);
  }

  async remove(userId: string, projectId: string, rowId: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);
    const hasPaymentRequests = await this.prisma.paymentRequest.findFirst({ where: { costControlRowId: rowId } });
    if (hasPaymentRequests) {
      throw new BadRequestException('這一列已經有請款單，不能刪除');
    }
    await this.prisma.costControlRow.delete({ where: { id: rowId } });
  }

  async reorder(userId: string, projectId: string, rowId: string, dto: ReorderCostControlRowDto) {
    await this.getAuthorizedProject(userId, projectId);
    const row = await this.getRowOrThrow(projectId, rowId);
    await this.getRowOrThrow(projectId, dto.targetId);

    const siblings = await this.prisma.costControlRow.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
    const withoutRow = siblings.filter((s) => s.id !== rowId);
    const targetIndex = withoutRow.findIndex((s) => s.id === dto.targetId);
    const insertIndex = dto.insertAfter ? targetIndex + 1 : targetIndex;
    withoutRow.splice(insertIndex, 0, row);

    await this.prisma.$transaction(
      withoutRow.map((sibling, index) =>
        this.prisma.costControlRow.update({ where: { id: sibling.id }, data: { sortOrder: index } }),
      ),
    );
  }

  /** 整批覆蓋這一列勾選的報價單工項——一個工項同時只能被一列勾選（避免業主
   * 報價/預估成本被重複加總到兩個不同的發包列）。 */
  async setQuotationItems(userId: string, projectId: string, rowId: string, dto: SetCostControlRowItemsDto) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);

    if (dto.quotationLineItemIds.length > 0) {
      const items = await this.prisma.quotationLineItem.findMany({
        where: { id: { in: dto.quotationLineItemIds }, projectId },
      });
      if (items.length !== dto.quotationLineItemIds.length) {
        throw new BadRequestException('有工項不存在或不屬於這個專案');
      }
      const alreadyGrouped = await this.prisma.costControlRowQuotationItem.findMany({
        where: { quotationLineItemId: { in: dto.quotationLineItemIds }, rowId: { not: rowId } },
      });
      if (alreadyGrouped.length > 0) {
        throw new BadRequestException('有工項已經被分配到別的成控列了');
      }
    }

    await this.prisma.$transaction([
      this.prisma.costControlRowQuotationItem.deleteMany({ where: { rowId } }),
      this.prisma.costControlRowQuotationItem.createMany({
        data: dto.quotationLineItemIds.map((quotationLineItemId) => ({ rowId, quotationLineItemId })),
      }),
    ]);

    const row = await this.prisma.costControlRow.findUniqueOrThrow({
      where: { id: rowId },
      include: includeRowDetail,
    });
    return this.summarize(row);
  }

  /** 拆項表——這一列底下實際勾選的報價單工項，各自的單價/數量/複價/成本複價,
   * 給 App 端渲染成獨立一張表匯出/列印用。 */
  async breakdown(userId: string, projectId: string, rowId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const row = await this.prisma.costControlRow.findUniqueOrThrow({
      where: { id: rowId },
      include: includeRowDetail,
    });
    if (row.projectId !== projectId) throw new NotFoundException('Cost control row not found');

    const items = row.quotationItems.map(({ quotationLineItem: item }) => ({
      id: item.id,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      complexPrice: item.unitPrice * item.quantity,
      costUnitPrice: item.costUnitPrice,
      costComplexPrice: item.costUnitPrice * item.quantity,
    }));

    return {
      rowId: row.id,
      rowName: row.name,
      items,
      totalComplexPrice: items.reduce((sum, i) => sum + i.complexPrice, 0),
      totalCostComplexPrice: items.reduce((sum, i) => sum + i.costComplexPrice, 0),
    };
  }

  async addAdjustment(userId: string, projectId: string, rowId: string, dto: CreateCostControlAdjustmentDto) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);
    await this.prisma.costControlAdjustment.create({
      data: { rowId, type: dto.type, amount: dto.amount, note: dto.note },
    });
    const row = await this.prisma.costControlRow.findUniqueOrThrow({
      where: { id: rowId },
      include: includeRowDetail,
    });
    return this.summarize(row);
  }

  async removeAdjustment(userId: string, projectId: string, rowId: string, adjustmentId: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);
    const adjustment = await this.prisma.costControlAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adjustment || adjustment.rowId !== rowId) {
      throw new NotFoundException('Adjustment not found');
    }
    await this.prisma.costControlAdjustment.delete({ where: { id: adjustmentId } });
    const row = await this.prisma.costControlRow.findUniqueOrThrow({
      where: { id: rowId },
      include: includeRowDetail,
    });
    return this.summarize(row);
  }

  /** 給 PaymentRequestsService 用——一列目前真正的「合約金額」跟「累計已
   * 請款百分比」，送出請款單當下就是拿這個現算的值去做快照。 */
  async getContractSnapshot(rowId: string): Promise<{ contractAmount: number; billedPercent: number }> {
    const row = await this.prisma.costControlRow.findUniqueOrThrow({
      where: { id: rowId },
      include: includeRowDetail,
    });
    const summary = this.summarize(row);
    return { contractAmount: summary.contractAmount, billedPercent: summary.billedPercent };
  }

  private summarize(
    row: CostControlRow & {
      quotationItems: Array<{ quotationLineItem: { unitPrice: number; quantity: number; costUnitPrice: number } }>;
      adjustments: Array<{ type: 'ADD' | 'DEDUCT'; amount: number }>;
      procurementComparison: { finalAwardedAmount: number | null } | null;
      paymentRequests: Array<{ amount: number; overallStatus: DocumentApprovalStatus }>;
    },
  ) {
    const quoteRevenueTotal = row.quotationItems.reduce(
      (sum, i) => sum + i.quotationLineItem.unitPrice * i.quotationLineItem.quantity,
      0,
    );
    const estimatedCostTotal = row.quotationItems.reduce(
      (sum, i) => sum + i.quotationLineItem.costUnitPrice * i.quotationLineItem.quantity,
      0,
    );
    const awardedAmount = row.procurementComparison?.finalAwardedAmount ?? null;
    const adjustmentsTotal = row.adjustments.reduce(
      (sum, a) => sum + (a.type === 'ADD' ? a.amount : -a.amount),
      0,
    );
    const contractAmount = (awardedAmount ?? 0) + adjustmentsTotal;
    const billedTotal = row.paymentRequests
      .filter((p) => p.overallStatus === DocumentApprovalStatus.APPROVED)
      .reduce((sum, p) => sum + p.amount, 0);
    const billedPercent = contractAmount > 0 ? billedTotal / contractAmount : 0;

    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      sortOrder: row.sortOrder,
      procurementComparisonId: row.procurementComparisonId,
      quotationItems: row.quotationItems.map((i) => i.quotationLineItem),
      quoteRevenueTotal,
      estimatedCostTotal,
      awardedAmount,
      adjustmentsTotal,
      contractAmount,
      billedTotal,
      billedPercent,
      adjustments: row.adjustments,
    };
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getRowOrThrow(projectId: string, rowId: string): Promise<CostControlRow> {
    const row = await this.prisma.costControlRow.findUnique({ where: { id: rowId } });
    if (!row || row.projectId !== projectId) {
      throw new NotFoundException('Cost control row not found');
    }
    return row;
  }

  private async getComparisonOrThrow(projectId: string, comparisonId: string) {
    const comparison = await this.prisma.procurementComparison.findUnique({ where: { id: comparisonId } });
    if (!comparison || comparison.projectId !== projectId) {
      throw new BadRequestException('採發比價表不存在或不屬於這個專案');
    }
    return comparison;
  }
}
