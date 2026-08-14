import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { EngineeringQuotationService } from './engineering-quotation.service';
import { DocumentApprovalsService } from '../document-approvals/document-approvals.service';
import { DocumentApprovalStatus } from '../../generated/prisma/client.js';
import type {
  CostControlAdjustmentSide,
  CostControlRow,
} from '../../generated/prisma/client.js';
import { CreateCostControlRowDto } from './dto/create-cost-control-row.dto';
import { UpdateCostControlRowDto } from './dto/update-cost-control-row.dto';
import { ReorderCostControlRowDto } from './dto/reorder-cost-control-row.dto';
import { SetCostControlRowItemsDto } from './dto/set-cost-control-row-items.dto';
import { CreateCostControlAdjustmentDto } from './dto/create-cost-control-adjustment.dto';
import { SubmitFixedRoleApprovalDto } from './dto/submit-fixed-role-approval.dto';

const includeRowDetail = {
  quotationItems: true,
  adjustments: { orderBy: { createdAt: 'asc' as const } },
  procurementComparison: true,
  paymentRequestPeriods: true,
};

type RowWithDetail = CostControlRow & {
  quotationItems: Array<{ quotationLineItemId: string }>;
  adjustments: Array<{
    side: CostControlAdjustmentSide;
    type: 'ADD' | 'DEDUCT';
    amount: number;
  }>;
  procurementComparison: { finalAwardedAmount: number | null } | null;
  paymentRequestPeriods: Array<{ id: string }>;
};

/**
 * 成控管制表——①初始管制表／②拆項表／③執行中成控表三張子表都在這裡。
 * ①是唯一要簽核、跟 Project 1:1 的一張，內容即時從報價單頂層大項算出，
 * 簽核通過那一刻才把算出的內容凍結進 lockedSnapshotJson。②/③是「完全連動」
 * 的同一份 CostControlRow 資料——②是分組結構本身，③是②再加上實際發包/
 * 期數金額/追加減這些欄位，這裡不分開兩個 model，一律用 summarize() 現算。
 */
@Injectable()
export class CostControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly quotationService: EngineeringQuotationService,
    private readonly documentApprovals: DocumentApprovalsService,
  ) {}

  // --- ①初始管制表 ------------------------------------------------------

  async getInitialSheet(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const sheet = await this.prisma.costControlInitialSheet.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
    const locked = await this.documentApprovals.isLockedForTarget({
      type: 'COST_CONTROL_INITIAL_SHEET',
      id: sheet.id,
    });

    if (locked) {
      if (!sheet.lockedSnapshotJson) {
        // 第一次在鎖定後被讀取——把當下算出的內容凍結存起來，之後報價單
        // 再被改也不會影響這份已核准的紀錄。
        const snapshot = await this.computeInitialSheetItems(projectId);
        await this.prisma.costControlInitialSheet.update({
          where: { id: sheet.id },
          data: { lockedSnapshotJson: { items: snapshot } },
        });
        return { id: sheet.id, locked: true, items: snapshot };
      }
      const snapshotJson = sheet.lockedSnapshotJson as {
        items: Array<Record<string, unknown>>;
      };
      return { id: sheet.id, locked: true, items: snapshotJson.items };
    }

    const items = await this.computeInitialSheetItems(projectId);
    return { id: sheet.id, locked: false, items };
  }

  async submitInitialSheet(
    userId: string,
    projectId: string,
    dto: SubmitFixedRoleApprovalDto,
  ) {
    await this.documentApprovals.submitCostControlInitialSheet(
      userId,
      projectId,
      dto.approverUserIds,
    );
    return this.getInitialSheet(userId, projectId);
  }

  async initialSheetHistory(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const sheet = await this.prisma.costControlInitialSheet.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
    return this.documentApprovals.historyForTarget({
      type: 'COST_CONTROL_INITIAL_SHEET',
      id: sheet.id,
    });
  }

  private async computeInitialSheetItems(projectId: string) {
    const topLevel = await this.quotationService.getTopLevelItems(projectId);
    return topLevel.map((node) => {
      const ownerQuoteAmount = node.negotiatedComplexPrice;
      const estimatedCostAmount = node.costComplexPrice;
      return {
        quotationLineItemId: node.id,
        name: node.name,
        ownerQuoteAmount,
        estimatedCostAmount,
        marginPercent:
          ownerQuoteAmount !== 0
            ? (ownerQuoteAmount - estimatedCostAmount) / ownerQuoteAmount
            : 0,
      };
    });
  }

  // --- ②拆項表／③執行中成控表（同一份 CostControlRow） -----------------

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const rows = await this.prisma.costControlRow.findMany({
      where: { projectId },
      include: includeRowDetail,
      orderBy: { sortOrder: 'asc' },
    });
    const itemsById =
      await this.quotationService.getComputedItemsById(projectId);
    return Promise.all(rows.map((row) => this.summarize(row, itemsById)));
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreateCostControlRowDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    if (dto.procurementComparisonId) {
      await this.getComparisonOrThrow(projectId, dto.procurementComparisonId);
    }

    const maxSortOrder = await this.prisma.costControlRow.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    });

    await this.prisma.costControlRow.create({
      data: {
        projectId,
        name: dto.name,
        procurementComparisonId: dto.procurementComparisonId,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
    return this.list(userId, projectId);
  }

  async update(
    userId: string,
    projectId: string,
    rowId: string,
    dto: UpdateCostControlRowDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);
    if (dto.procurementComparisonId) {
      await this.getComparisonOrThrow(projectId, dto.procurementComparisonId);
    }

    await this.prisma.costControlRow.update({
      where: { id: rowId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.procurementComparisonId !== undefined && {
          procurementComparisonId: dto.procurementComparisonId,
        }),
      },
    });
    return this.list(userId, projectId);
  }

  async remove(userId: string, projectId: string, rowId: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);
    const hasPeriods = await this.prisma.paymentRequestPeriod.findFirst({
      where: { costControlRowId: rowId },
    });
    if (hasPeriods) {
      throw new BadRequestException('這一列已經有請款單，不能刪除');
    }
    await this.prisma.costControlRow.delete({ where: { id: rowId } });
  }

  async reorder(
    userId: string,
    projectId: string,
    rowId: string,
    dto: ReorderCostControlRowDto,
  ) {
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
        this.prisma.costControlRow.update({
          where: { id: sibling.id },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  /** 整批覆蓋這一列勾選的報價單工項（任一層級皆可，不限葉節點）——一個工項
   * 同時只能被一列勾選，避免業主報價/預估成本被重複加總到兩個發包列。 */
  async setQuotationItems(
    userId: string,
    projectId: string,
    rowId: string,
    dto: SetCostControlRowItemsDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);

    if (dto.quotationLineItemIds.length > 0) {
      const itemsById =
        await this.quotationService.getComputedItemsById(projectId);
      for (const id of dto.quotationLineItemIds) {
        if (!itemsById.has(id)) {
          throw new BadRequestException('有工項不存在或不屬於這個專案');
        }
      }
      const alreadyGrouped =
        await this.prisma.costControlRowQuotationItem.findMany({
          where: {
            quotationLineItemId: { in: dto.quotationLineItemIds },
            rowId: { not: rowId },
          },
        });
      if (alreadyGrouped.length > 0) {
        throw new BadRequestException('有工項已經被分配到別的成控列了');
      }
    }

    await this.prisma.$transaction([
      this.prisma.costControlRowQuotationItem.deleteMany({ where: { rowId } }),
      this.prisma.costControlRowQuotationItem.createMany({
        data: dto.quotationLineItemIds.map((quotationLineItemId) => ({
          rowId,
          quotationLineItemId,
        })),
      }),
    ]);
    return this.list(userId, projectId);
  }

  /** 拆項表匯出——這一列底下實際勾選的報價單工項，各自的複價/成本複價，
   * 給 App 端渲染成獨立一張表匯出/列印用。 */
  async breakdown(userId: string, projectId: string, rowId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const row = await this.prisma.costControlRow.findUniqueOrThrow({
      where: { id: rowId },
      include: includeRowDetail,
    });
    if (row.projectId !== projectId)
      throw new NotFoundException('Cost control row not found');

    const itemsById =
      await this.quotationService.getComputedItemsById(projectId);
    const items = row.quotationItems.map(({ quotationLineItemId }) => {
      const node = itemsById.get(quotationLineItemId)!;
      return {
        id: node.id,
        name: node.name,
        unitPrice: node.unitPrice,
        quantity: node.quantity,
        complexPrice: node.complexPrice,
        costUnitPrice: node.costUnitPrice,
        costComplexPrice: node.costComplexPrice,
      };
    });

    return {
      rowId: row.id,
      rowName: row.name,
      items,
      totalComplexPrice: items.reduce((sum, i) => sum + i.complexPrice, 0),
      totalCostComplexPrice: items.reduce(
        (sum, i) => sum + i.costComplexPrice,
        0,
      ),
    };
  }

  /** side 固定 OWNER——這是使用者明確要求的「兩件獨立的事」之一：業主端的
   * 追加減只能來自②拆項表跟原報價單分組的差異，這裡是給使用者手動記錄那個
   * 差異用的（自動偵測分組差異是進一步優化，先讓使用者自己記帳）。VENDOR
   * 端只能透過 PaymentRequestPeriodsService 的追加款欄位產生，不開放這個
   * 入口直接建立，維持「兩件獨立的事」不被繞過。 */
  async addOwnerAdjustment(
    userId: string,
    projectId: string,
    rowId: string,
    dto: CreateCostControlAdjustmentDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);
    await this.prisma.costControlAdjustment.create({
      data: {
        rowId,
        side: 'OWNER',
        type: dto.type,
        amount: dto.amount,
        note: dto.note,
      },
    });
    return this.list(userId, projectId);
  }

  async removeAdjustment(
    userId: string,
    projectId: string,
    rowId: string,
    adjustmentId: string,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getRowOrThrow(projectId, rowId);
    const adjustment = await this.prisma.costControlAdjustment.findUnique({
      where: { id: adjustmentId },
    });
    if (!adjustment || adjustment.rowId !== rowId) {
      throw new NotFoundException('Adjustment not found');
    }
    await this.prisma.costControlAdjustment.delete({
      where: { id: adjustmentId },
    });
    return this.list(userId, projectId);
  }

  /** 給 ProcurementComparisonsService 用——一列目前的業主報價／預估成本，
   * 決標時比價表要自動帶入這兩個數字。 */
  async getRowTotals(
    rowId: string,
  ): Promise<{ ownerQuoteAmount: number; estimatedCostAmount: number }> {
    const row = await this.prisma.costControlRow.findUniqueOrThrow({
      where: { id: rowId },
      include: { quotationItems: true, project: { select: { id: true } } },
    });
    const itemsById = await this.quotationService.getComputedItemsById(
      row.projectId,
    );
    let ownerQuoteAmount = 0;
    let estimatedCostAmount = 0;
    for (const { quotationLineItemId } of row.quotationItems) {
      const node = itemsById.get(quotationLineItemId);
      if (!node) continue;
      ownerQuoteAmount += node.negotiatedComplexPrice;
      estimatedCostAmount += node.costComplexPrice;
    }
    return { ownerQuoteAmount, estimatedCostAmount };
  }

  /** 給 PaymentRequestPeriodsService 用——一列目前真正的「合約金額（發包
   * 端）」跟「累計已請款百分比」，送出請款單當下就是拿這個現算的值去做
   * 快照。 */
  async getContractSnapshot(
    rowId: string,
  ): Promise<{ contractAmount: number; billedPercent: number }> {
    const row = await this.prisma.costControlRow.findUniqueOrThrow({
      where: { id: rowId },
      include: includeRowDetail,
    });
    const itemsById = await this.quotationService.getComputedItemsById(
      row.projectId,
    );
    const summary = await this.summarize(row, itemsById);
    return {
      contractAmount: summary.vendorContractAmount,
      billedPercent: summary.billedPercent,
    };
  }

  /** 加一筆 side=VENDOR 的追加減，只給 PaymentRequestPeriodsService 內部
   * 呼叫（請款單「追加款」的落地點）。 */
  async recordVendorAdjustment(rowId: string, amount: number, note: string) {
    const type = amount >= 0 ? 'ADD' : 'DEDUCT';
    await this.prisma.costControlAdjustment.create({
      data: { rowId, side: 'VENDOR', type, amount: Math.abs(amount), note },
    });
  }

  private async summarize(
    row: RowWithDetail,
    itemsById: Map<
      string,
      { negotiatedComplexPrice: number; costComplexPrice: number }
    >,
  ) {
    let quoteRevenueTotal = 0;
    let estimatedCostTotal = 0;
    for (const { quotationLineItemId } of row.quotationItems) {
      const node = itemsById.get(quotationLineItemId);
      if (!node) continue;
      quoteRevenueTotal += node.negotiatedComplexPrice;
      estimatedCostTotal += node.costComplexPrice;
    }

    const awardedAmount = row.procurementComparison?.finalAwardedAmount ?? null;
    const ownerAdjustmentsTotal = row.adjustments
      .filter((a) => a.side === 'OWNER')
      .reduce((sum, a) => sum + (a.type === 'ADD' ? a.amount : -a.amount), 0);
    const vendorAdjustmentsTotal = row.adjustments
      .filter((a) => a.side === 'VENDOR')
      .reduce((sum, a) => sum + (a.type === 'ADD' ? a.amount : -a.amount), 0);

    const ownerContractAmount = quoteRevenueTotal + ownerAdjustmentsTotal;
    const vendorContractAmount = (awardedAmount ?? 0) + vendorAdjustmentsTotal;

    const periodIds = row.paymentRequestPeriods.map((p) => p.id);
    const approvedApprovals =
      periodIds.length > 0
        ? await this.prisma.documentApproval.findMany({
            where: {
              paymentRequestPeriodId: { in: periodIds },
              status: DocumentApprovalStatus.APPROVED,
            },
            select: { paymentRequestPeriodId: true },
          })
        : [];
    const lockedPeriodIds = [
      ...new Set(approvedApprovals.map((a) => a.paymentRequestPeriodId)),
    ].filter((id): id is string => id !== null);
    const lockedPeriods =
      lockedPeriodIds.length > 0
        ? await this.prisma.paymentRequestPeriod.findMany({
            where: { id: { in: lockedPeriodIds } },
          })
        : [];
    const billedTotal = lockedPeriods.reduce((sum, p) => sum + p.amount, 0);
    const billedPercent =
      vendorContractAmount > 0 ? billedTotal / vendorContractAmount : 0;

    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      sortOrder: row.sortOrder,
      procurementComparisonId: row.procurementComparisonId,
      quotationLineItemIds: row.quotationItems.map(
        (i) => i.quotationLineItemId,
      ),
      quoteRevenueTotal,
      estimatedCostTotal,
      awardedAmount,
      ownerAdjustmentsTotal,
      vendorAdjustmentsTotal,
      ownerContractAmount,
      vendorContractAmount,
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

  private async getRowOrThrow(
    projectId: string,
    rowId: string,
  ): Promise<CostControlRow> {
    const row = await this.prisma.costControlRow.findUnique({
      where: { id: rowId },
    });
    if (!row || row.projectId !== projectId) {
      throw new NotFoundException('Cost control row not found');
    }
    return row;
  }

  private async getComparisonOrThrow(projectId: string, comparisonId: string) {
    const comparison = await this.prisma.procurementComparison.findUnique({
      where: { id: comparisonId },
    });
    if (!comparison || comparison.projectId !== projectId) {
      throw new BadRequestException('採發比價表不存在或不屬於這個專案');
    }
    return comparison;
  }
}
