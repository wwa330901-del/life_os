import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import type { QuotationLineItem } from '../../generated/prisma/client.js';
import { CreateQuotationItemDto } from './dto/create-quotation-item.dto';
import { UpdateQuotationItemDto } from './dto/update-quotation-item.dto';
import { ReorderQuotationItemDto } from './dto/reorder-quotation-item.dto';
import { ApplyQuotationTargetDto } from './dto/apply-quotation-target.dto';

export interface QuotationItemWithTotals extends QuotationLineItem {
  complexPrice: number;
  costComplexPrice: number;
  profit: number;
  marginRate: number;
}

/**
 * 工程報價單一列工項 — 業主報價(單價×數量→複價)跟成本(成本單價×數量→成本
 * 複價)並列，利潤/毛利率是兩者的差，全部是衍生值（不落地存欄位），每次讀取
 * 都用 `withTotals` 現算，不用擔心欄位改了忘記重算的問題。
 */
@Injectable()
export class QuotationItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const items = await this.prisma.quotationLineItem.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
    const withTotals = items.map((item) => this.withTotals(item));
    return { items: withTotals, summary: this.summarize(withTotals) };
  }

  async create(userId: string, projectId: string, dto: CreateQuotationItemDto) {
    await this.getAuthorizedProject(userId, projectId);

    const maxSortOrder = await this.prisma.quotationLineItem.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    });

    const created = await this.prisma.quotationLineItem.create({
      data: {
        projectId,
        name: dto.name,
        unitPrice: dto.unitPrice,
        quantity: dto.quantity,
        costUnitPrice: dto.costUnitPrice,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
    return this.withTotals(created);
  }

  async update(userId: string, projectId: string, itemId: string, dto: UpdateQuotationItemDto) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getItemOrThrow(projectId, itemId);

    const updated = await this.prisma.quotationLineItem.update({
      where: { id: itemId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.costUnitPrice !== undefined && { costUnitPrice: dto.costUnitPrice }),
      },
    });
    return this.withTotals(updated);
  }

  async remove(userId: string, projectId: string, itemId: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getItemOrThrow(projectId, itemId);
    await this.prisma.quotationLineItem.delete({ where: { id: itemId } });
  }

  async reorder(userId: string, projectId: string, itemId: string, dto: ReorderQuotationItemDto) {
    await this.getAuthorizedProject(userId, projectId);
    const item = await this.getItemOrThrow(projectId, itemId);
    const target = await this.getItemOrThrow(projectId, dto.targetId);
    void target;

    const siblings = await this.prisma.quotationLineItem.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
    const withoutItem = siblings.filter((s) => s.id !== itemId);
    const targetIndex = withoutItem.findIndex((s) => s.id === dto.targetId);
    const insertIndex = dto.insertAfter ? targetIndex + 1 : targetIndex;
    withoutItem.splice(insertIndex, 0, item);

    await this.prisma.$transaction(
      withoutItem.map((sibling, index) =>
        this.prisma.quotationLineItem.update({ where: { id: sibling.id }, data: { sortOrder: index } }),
      ),
    );
  }

  /**
   * 「設定目標毛利率」讓每一列都套用同一個毛利率反推單價
   * （unitPrice = costUnitPrice / (1 - targetMarginRate)）；「設定目標總金額」
   * 則保持每列相對成本權重不變，把總複價依現有複價佔比分攤到目標總金額，
   * 兩種都是一次性批次寫入 unitPrice，不是常駐設定。
   */
  async applyTarget(userId: string, projectId: string, dto: ApplyQuotationTargetDto) {
    await this.getAuthorizedProject(userId, projectId);

    const items = await this.prisma.quotationLineItem.findMany({
      where: { projectId, ...(dto.itemIds?.length ? { id: { in: dto.itemIds } } : {}) },
    });
    if (items.length === 0) {
      throw new BadRequestException('沒有可以套用的工項');
    }

    if (dto.mode === 'MARGIN') {
      if (dto.targetMarginRate === undefined) {
        throw new BadRequestException('MARGIN 模式需要 targetMarginRate');
      }
      if (dto.targetMarginRate >= 1) {
        throw new BadRequestException('目標毛利率必須小於 100%');
      }
      const divisor = 1 - dto.targetMarginRate;
      await this.prisma.$transaction(
        items.map((item) =>
          this.prisma.quotationLineItem.update({
            where: { id: item.id },
            data: { unitPrice: item.costUnitPrice / divisor },
          }),
        ),
      );
    } else {
      if (dto.targetTotalAmount === undefined) {
        throw new BadRequestException('TOTAL 模式需要 targetTotalAmount');
      }
      const currentTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      if (currentTotal <= 0) {
        throw new BadRequestException('目前選取的工項複價總和是 0，無法依比例分攤');
      }
      await this.prisma.$transaction(
        items.map((item) => {
          const currentComplexPrice = item.unitPrice * item.quantity;
          const newComplexPrice = (dto.targetTotalAmount! * currentComplexPrice) / currentTotal;
          const newUnitPrice = item.quantity > 0 ? newComplexPrice / item.quantity : 0;
          return this.prisma.quotationLineItem.update({
            where: { id: item.id },
            data: { unitPrice: newUnitPrice },
          });
        }),
      );
    }

    return this.list(userId, projectId);
  }

  private withTotals(item: QuotationLineItem): QuotationItemWithTotals {
    const complexPrice = item.unitPrice * item.quantity;
    const costComplexPrice = item.costUnitPrice * item.quantity;
    const profit = complexPrice - costComplexPrice;
    const marginRate = complexPrice !== 0 ? profit / complexPrice : 0;
    return { ...item, complexPrice, costComplexPrice, profit, marginRate };
  }

  private summarize(items: QuotationItemWithTotals[]) {
    const complexPrice = items.reduce((sum, i) => sum + i.complexPrice, 0);
    const costComplexPrice = items.reduce((sum, i) => sum + i.costComplexPrice, 0);
    const profit = complexPrice - costComplexPrice;
    const marginRate = complexPrice !== 0 ? profit / complexPrice : 0;
    return { complexPrice, costComplexPrice, profit, marginRate };
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getItemOrThrow(projectId: string, itemId: string): Promise<QuotationLineItem> {
    const item = await this.prisma.quotationLineItem.findUnique({ where: { id: itemId } });
    if (!item || item.projectId !== projectId) {
      throw new NotFoundException('Quotation line item not found');
    }
    return item;
  }
}
