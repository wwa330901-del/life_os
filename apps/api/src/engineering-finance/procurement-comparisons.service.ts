import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { SupabaseStorageService } from '../knowledge/supabase-storage.service';
import type { ProcurementComparison, ProcurementVendorQuote } from '../../generated/prisma/client.js';
import { CreateProcurementComparisonDto } from './dto/create-procurement-comparison.dto';
import { UpdateProcurementComparisonDto } from './dto/update-procurement-comparison.dto';
import { CreateVendorQuoteDto } from './dto/create-vendor-quote.dto';
import { UpdateVendorQuoteDto } from './dto/update-vendor-quote.dto';
import { SelectVendorQuoteDto } from './dto/select-vendor-quote.dto';

const includeVendorQuotes = { vendorQuotes: { orderBy: { createdAt: 'asc' as const } }, selectedVendorQuote: true };

/**
 * 採發比價表 — 一個專案可以有多張（每張對應一個發包範圍），跟報價單整案
 * 只有一份不同。附件沿用知識庫已經在用的 SupabaseStorageService，路徑用
 * `procurement/{comparisonId}/{vendorQuoteId}` 前綴跟知識庫的
 * `knowledge/{itemId}` 區分開。
 */
@Injectable()
export class ProcurementComparisonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const comparisons = await this.prisma.procurementComparison.findMany({
      where: { projectId },
      include: includeVendorQuotes,
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(comparisons.map((c) => this.withAttachmentUrls(c)));
  }

  async create(userId: string, projectId: string, dto: CreateProcurementComparisonDto) {
    await this.getAuthorizedProject(userId, projectId);
    const created = await this.prisma.procurementComparison.create({
      data: { projectId, scopeName: dto.scopeName },
      include: includeVendorQuotes,
    });
    return this.withAttachmentUrls(created);
  }

  async update(userId: string, projectId: string, comparisonId: string, dto: UpdateProcurementComparisonDto) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getComparisonOrThrow(projectId, comparisonId);
    const updated = await this.prisma.procurementComparison.update({
      where: { id: comparisonId },
      data: { ...(dto.scopeName !== undefined && { scopeName: dto.scopeName }) },
      include: includeVendorQuotes,
    });
    return this.withAttachmentUrls(updated);
  }

  async remove(userId: string, projectId: string, comparisonId: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getComparisonOrThrow(projectId, comparisonId);
    const inUse = await this.prisma.costControlRow.findFirst({ where: { procurementComparisonId: comparisonId } });
    if (inUse) {
      throw new BadRequestException('這張比價表已經被成控表列引用，要先解除連結才能刪除');
    }
    // selectedVendorQuoteId 指回 vendorQuotes 其中一筆，Postgres 會拒絕循環
    // cascade——先清掉 selectedVendorQuoteId 再讓 vendorQuotes 的 cascade 生效。
    await this.prisma.procurementComparison.update({
      where: { id: comparisonId },
      data: { selectedVendorQuoteId: null },
    });
    await this.prisma.procurementComparison.delete({ where: { id: comparisonId } });
  }

  async addVendorQuote(userId: string, projectId: string, comparisonId: string, dto: CreateVendorQuoteDto) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getComparisonOrThrow(projectId, comparisonId);
    await this.prisma.procurementVendorQuote.create({
      data: { comparisonId, vendorName: dto.vendorName, quotedAmount: dto.quotedAmount, note: dto.note },
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
    await this.getComparisonOrThrow(projectId, comparisonId);
    await this.getVendorQuoteOrThrow(comparisonId, vendorQuoteId);
    await this.prisma.procurementVendorQuote.update({
      where: { id: vendorQuoteId },
      data: {
        ...(dto.vendorName !== undefined && { vendorName: dto.vendorName }),
        ...(dto.quotedAmount !== undefined && { quotedAmount: dto.quotedAmount }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });
    return this.getComparisonForResponse(comparisonId);
  }

  async removeVendorQuote(userId: string, projectId: string, comparisonId: string, vendorQuoteId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const comparison = await this.getComparisonOrThrow(projectId, comparisonId);
    await this.getVendorQuoteOrThrow(comparisonId, vendorQuoteId);
    if (comparison.selectedVendorQuoteId === vendorQuoteId) {
      throw new BadRequestException('不能刪除已經被選定為得標的廠商報價，請先取消選定');
    }
    await this.prisma.procurementVendorQuote.delete({ where: { id: vendorQuoteId } });
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
    if (!this.storage.configured) throw new BadRequestException('檔案儲存服務尚未設定');
    await this.getAuthorizedProject(userId, projectId);
    await this.getComparisonOrThrow(projectId, comparisonId);
    await this.getVendorQuoteOrThrow(comparisonId, vendorQuoteId);

    const extension = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'bin';
    const path = `procurement/${comparisonId}/${vendorQuoteId}.${extension}`;
    await this.storage.upload(path, file.buffer, file.mimetype || 'application/octet-stream');
    await this.prisma.procurementVendorQuote.update({
      where: { id: vendorQuoteId },
      data: { attachmentFilePath: path },
    });
    return this.getComparisonForResponse(comparisonId);
  }

  async selectVendor(userId: string, projectId: string, comparisonId: string, dto: SelectVendorQuoteDto) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getComparisonOrThrow(projectId, comparisonId);
    const vendorQuote = await this.getVendorQuoteOrThrow(comparisonId, dto.vendorQuoteId);

    await this.prisma.procurementComparison.update({
      where: { id: comparisonId },
      data: {
        selectedVendorQuoteId: dto.vendorQuoteId,
        finalAwardedAmount: dto.finalAwardedAmount ?? vendorQuote.quotedAmount,
      },
    });
    return this.getComparisonForResponse(comparisonId);
  }

  private async getComparisonForResponse(comparisonId: string) {
    const comparison = await this.prisma.procurementComparison.findUniqueOrThrow({
      where: { id: comparisonId },
      include: includeVendorQuotes,
    });
    return this.withAttachmentUrls(comparison);
  }

  private async withAttachmentUrls(
    comparison: ProcurementComparison & {
      vendorQuotes: ProcurementVendorQuote[];
      selectedVendorQuote: ProcurementVendorQuote | null;
    },
  ) {
    const vendorQuotes = await Promise.all(
      comparison.vendorQuotes.map(async (q) => ({
        ...q,
        attachmentUrl: q.attachmentFilePath ? await this.storage.getSignedUrl(q.attachmentFilePath) : null,
      })),
    );
    return { ...comparison, vendorQuotes };
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getComparisonOrThrow(projectId: string, comparisonId: string): Promise<ProcurementComparison> {
    const comparison = await this.prisma.procurementComparison.findUnique({ where: { id: comparisonId } });
    if (!comparison || comparison.projectId !== projectId) {
      throw new NotFoundException('Procurement comparison not found');
    }
    return comparison;
  }

  private async getVendorQuoteOrThrow(comparisonId: string, vendorQuoteId: string): Promise<ProcurementVendorQuote> {
    const quote = await this.prisma.procurementVendorQuote.findUnique({ where: { id: vendorQuoteId } });
    if (!quote || quote.comparisonId !== comparisonId) {
      throw new NotFoundException('Vendor quote not found');
    }
    return quote;
  }
}
