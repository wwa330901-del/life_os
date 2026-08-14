import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { SupabaseStorageService } from '../knowledge/supabase-storage.service';
import { CostControlService } from './cost-control.service';
import { EngineeringQuotationService } from './engineering-quotation.service';
import { DocumentApprovalsService } from '../document-approvals/document-approvals.service';
import type {
  ProcurementComparison,
  ProcurementVendorQuote,
} from '../../generated/prisma/client.js';
import { CreateProcurementComparisonDto } from './dto/create-procurement-comparison.dto';
import { UpdateProcurementComparisonDto } from './dto/update-procurement-comparison.dto';
import { CreateVendorQuoteDto } from './dto/create-vendor-quote.dto';
import { UpdateVendorQuoteDto } from './dto/update-vendor-quote.dto';
import { SelectVendorQuoteDto } from './dto/select-vendor-quote.dto';
import { SubmitFixedRoleApprovalDto } from './dto/submit-fixed-role-approval.dto';

const includeVendorQuotes = {
  vendorQuotes: {
    orderBy: { createdAt: 'asc' as const },
    include: { vendor: true },
  },
  selectedVendorQuote: { include: { vendor: true } },
};

/**
 * 採發比價表——一個專案可以有多張，每一張對應報價單裡的「一個大項」，跟
 * 成控列（CostControlRow）1:1（②拆項表定案那一刻，一列＝一個發包＝一張
 * 比價表）。業主報價／發包預算不落地存在這張表上，是即時從對應成控列現算
 * 帶入的（見 withComputedFields）。附件沿用知識庫已經在用的
 * SupabaseStorageService，路徑用 `procurement/{comparisonId}/{vendorQuoteId}`
 * 前綴跟知識庫的 `knowledge/{itemId}` 區分開。
 */
@Injectable()
export class ProcurementComparisonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly storage: SupabaseStorageService,
    private readonly costControlService: CostControlService,
    private readonly quotationService: EngineeringQuotationService,
    private readonly documentApprovals: DocumentApprovalsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const comparisons = await this.prisma.procurementComparison.findMany({
      where: { projectId },
      include: includeVendorQuotes,
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(comparisons.map((c) => this.withComputedFields(c)));
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreateProcurementComparisonDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);

    const itemsById =
      await this.quotationService.getComputedItemsById(projectId);
    const item = itemsById.get(dto.quotationLineItemId);
    if (!item) throw new BadRequestException('工項不存在或不屬於這個專案');
    if (item.parentId !== null) {
      throw new BadRequestException(
        '採發比價表只能對應報價單的大項（頂層工項）',
      );
    }
    const existing = await this.prisma.procurementComparison.findFirst({
      where: { quotationLineItemId: dto.quotationLineItemId },
    });
    if (existing) {
      throw new BadRequestException('這個大項已經有一張採發比價表了');
    }

    const created = await this.prisma.procurementComparison.create({
      data: {
        projectId,
        quotationLineItemId: dto.quotationLineItemId,
        inspectionMethod: dto.inspectionMethod,
        inspectionOtherNote: dto.inspectionOtherNote,
        paymentMethod: dto.paymentMethod,
        paymentOtherNote: dto.paymentOtherNote,
      },
      include: includeVendorQuotes,
    });
    return this.withComputedFields(created);
  }

  async update(
    userId: string,
    projectId: string,
    comparisonId: string,
    dto: UpdateProcurementComparisonDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getEditableComparisonOrThrow(projectId, comparisonId);
    const updated = await this.prisma.procurementComparison.update({
      where: { id: comparisonId },
      data: {
        ...(dto.inspectionMethod !== undefined && {
          inspectionMethod: dto.inspectionMethod,
        }),
        ...(dto.inspectionOtherNote !== undefined && {
          inspectionOtherNote: dto.inspectionOtherNote,
        }),
        ...(dto.paymentMethod !== undefined && {
          paymentMethod: dto.paymentMethod,
        }),
        ...(dto.paymentOtherNote !== undefined && {
          paymentOtherNote: dto.paymentOtherNote,
        }),
      },
      include: includeVendorQuotes,
    });
    return this.withComputedFields(updated);
  }

  async remove(userId: string, projectId: string, comparisonId: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getEditableComparisonOrThrow(projectId, comparisonId);
    const inUse = await this.prisma.costControlRow.findFirst({
      where: { procurementComparisonId: comparisonId },
    });
    if (inUse) {
      throw new BadRequestException(
        '這張比價表已經被成控表列引用，要先解除連結才能刪除',
      );
    }
    // selectedVendorQuoteId 指回 vendorQuotes 其中一筆，Postgres 會拒絕循環
    // cascade——先清掉 selectedVendorQuoteId 再讓 vendorQuotes 的 cascade 生效。
    await this.prisma.procurementComparison.update({
      where: { id: comparisonId },
      data: { selectedVendorQuoteId: null },
    });
    await this.prisma.procurementComparison.delete({
      where: { id: comparisonId },
    });
  }

  async addVendorQuote(
    userId: string,
    projectId: string,
    comparisonId: string,
    dto: CreateVendorQuoteDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getEditableComparisonOrThrow(projectId, comparisonId);
    await this.getVendorOrThrow(projectId, dto.vendorId);
    await this.prisma.procurementVendorQuote.create({
      data: {
        comparisonId,
        vendorId: dto.vendorId,
        quotedAmount: dto.quotedAmount,
        negotiatedAmount: dto.negotiatedAmount,
        note: dto.note,
      },
    });
    return this.getComparisonForResponse(comparisonId);
  }

  async updateVendorQuote(
    userId: string,
    projectId: string,
    comparisonId: string,
    vendorQuoteId: string,
    dto: UpdateVendorQuoteDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getEditableComparisonOrThrow(projectId, comparisonId);
    await this.getVendorQuoteOrThrow(comparisonId, vendorQuoteId);
    if (dto.vendorId) await this.getVendorOrThrow(projectId, dto.vendorId);
    await this.prisma.procurementVendorQuote.update({
      where: { id: vendorQuoteId },
      data: {
        ...(dto.vendorId !== undefined && { vendorId: dto.vendorId }),
        ...(dto.quotedAmount !== undefined && {
          quotedAmount: dto.quotedAmount,
        }),
        ...(dto.negotiatedAmount !== undefined && {
          negotiatedAmount: dto.negotiatedAmount,
        }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });
    return this.getComparisonForResponse(comparisonId);
  }

  async removeVendorQuote(
    userId: string,
    projectId: string,
    comparisonId: string,
    vendorQuoteId: string,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    const comparison = await this.getEditableComparisonOrThrow(
      projectId,
      comparisonId,
    );
    await this.getVendorQuoteOrThrow(comparisonId, vendorQuoteId);
    if (comparison.selectedVendorQuoteId === vendorQuoteId) {
      throw new BadRequestException(
        '不能刪除已經被選定為得標的廠商報價，請先取消選定',
      );
    }
    await this.prisma.procurementVendorQuote.delete({
      where: { id: vendorQuoteId },
    });
    return this.getComparisonForResponse(comparisonId);
  }

  async uploadAttachment(
    userId: string,
    projectId: string,
    comparisonId: string,
    vendorQuoteId: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('缺少附件檔案');
    if (!this.storage.configured)
      throw new BadRequestException('檔案儲存服務尚未設定');
    await this.getAuthorizedProject(userId, projectId);
    await this.getEditableComparisonOrThrow(projectId, comparisonId);
    await this.getVendorQuoteOrThrow(comparisonId, vendorQuoteId);

    const extension = file.originalname.includes('.')
      ? file.originalname.split('.').pop()
      : 'bin';
    const path = `procurement/${comparisonId}/${vendorQuoteId}.${extension}`;
    await this.storage.upload(
      path,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );
    await this.prisma.procurementVendorQuote.update({
      where: { id: vendorQuoteId },
      data: { attachmentFilePath: path },
    });
    return this.getComparisonForResponse(comparisonId);
  }

  /** 決標——回填這張比價表跟被選中報價的 awardedAmount/finalAwardedAmount。
   * 決標後這張表就可以送簽了（③執行中成控表的「實際發包」直接讀
   * finalAwardedAmount，這裡不用另外通知成控表）。 */
  async selectVendor(
    userId: string,
    projectId: string,
    comparisonId: string,
    dto: SelectVendorQuoteDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getEditableComparisonOrThrow(projectId, comparisonId);
    const vendorQuote = await this.getVendorQuoteOrThrow(
      comparisonId,
      dto.vendorQuoteId,
    );
    const awardedAmount =
      dto.finalAwardedAmount ??
      vendorQuote.negotiatedAmount ??
      vendorQuote.quotedAmount;

    await this.prisma.$transaction([
      this.prisma.procurementComparison.update({
        where: { id: comparisonId },
        data: {
          selectedVendorQuoteId: dto.vendorQuoteId,
          finalAwardedAmount: awardedAmount,
        },
      }),
      this.prisma.procurementVendorQuote.update({
        where: { id: dto.vendorQuoteId },
        data: { awardedAmount },
      }),
    ]);
    return this.getComparisonForResponse(comparisonId);
  }

  async submit(
    userId: string,
    projectId: string,
    comparisonId: string,
    dto: SubmitFixedRoleApprovalDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    const comparison = await this.getComparisonOrThrow(projectId, comparisonId);
    if (!comparison.finalAwardedAmount) {
      throw new BadRequestException('要先決標才能送簽');
    }
    await this.documentApprovals.submitProcurementComparison(
      userId,
      comparisonId,
      dto.approverUserIds,
    );
    return this.getComparisonForResponse(comparisonId);
  }

  async history(userId: string, projectId: string, comparisonId: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getComparisonOrThrow(projectId, comparisonId);
    return this.documentApprovals.historyForTarget({
      type: 'PROCUREMENT_COMPARISON',
      id: comparisonId,
    });
  }

  private async getComparisonForResponse(comparisonId: string) {
    const comparison =
      await this.prisma.procurementComparison.findUniqueOrThrow({
        where: { id: comparisonId },
        include: includeVendorQuotes,
      });
    return this.withComputedFields(comparison);
  }

  private async withComputedFields(
    comparison: ProcurementComparison & {
      vendorQuotes: Array<
        ProcurementVendorQuote & { vendor: { name: string } }
      >;
      selectedVendorQuote:
        (ProcurementVendorQuote & { vendor: { name: string } }) | null;
    },
  ) {
    const vendorQuotes = await Promise.all(
      comparison.vendorQuotes.map(async (q) => ({
        ...q,
        attachmentUrl: q.attachmentFilePath
          ? await this.storage.getSignedUrl(q.attachmentFilePath)
          : null,
      })),
    );

    const row = await this.prisma.costControlRow.findUnique({
      where: { procurementComparisonId: comparison.id },
    });
    const rowTotals = row
      ? await this.costControlService.getRowTotals(row.id)
      : null;
    const locked = await this.documentApprovals.isLockedForTarget({
      type: 'PROCUREMENT_COMPARISON',
      id: comparison.id,
    });
    const marginRate =
      comparison.finalAwardedAmount &&
      rowTotals &&
      rowTotals.ownerQuoteAmount !== 0
        ? (rowTotals.ownerQuoteAmount - comparison.finalAwardedAmount) /
          rowTotals.ownerQuoteAmount
        : null;

    return {
      ...comparison,
      vendorQuotes,
      ownerQuoteAmount: rowTotals?.ownerQuoteAmount ?? null,
      procurementBudget: rowTotals?.estimatedCostAmount ?? null,
      marginRate,
      locked,
    };
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getComparisonOrThrow(
    projectId: string,
    comparisonId: string,
  ): Promise<ProcurementComparison> {
    const comparison = await this.prisma.procurementComparison.findUnique({
      where: { id: comparisonId },
    });
    if (!comparison || comparison.projectId !== projectId) {
      throw new NotFoundException('Procurement comparison not found');
    }
    return comparison;
  }

  private async getEditableComparisonOrThrow(
    projectId: string,
    comparisonId: string,
  ): Promise<ProcurementComparison> {
    const comparison = await this.getComparisonOrThrow(projectId, comparisonId);
    const locked = await this.documentApprovals.isLockedForTarget({
      type: 'PROCUREMENT_COMPARISON',
      id: comparisonId,
    });
    if (locked) {
      throw new BadRequestException('這張比價表已經簽核鎖定，不能再編輯');
    }
    return comparison;
  }

  private async getVendorQuoteOrThrow(
    comparisonId: string,
    vendorQuoteId: string,
  ): Promise<ProcurementVendorQuote> {
    const quote = await this.prisma.procurementVendorQuote.findUnique({
      where: { id: vendorQuoteId },
    });
    if (!quote || quote.comparisonId !== comparisonId) {
      throw new NotFoundException('Vendor quote not found');
    }
    return quote;
  }

  private async getVendorOrThrow(projectId: string, vendorId: string) {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor || vendor.spaceId !== project.spaceId) {
      throw new BadRequestException('廠商不存在或不屬於這個公司空間');
    }
    return vendor;
  }
}
