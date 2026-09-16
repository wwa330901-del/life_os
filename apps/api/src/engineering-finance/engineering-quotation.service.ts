import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { PermissionsService } from '../permissions/permissions.service';
import { FieldChangeLogService } from '../audit/field-change-log.service';
import {
  FieldChangeEntityType,
  PermissionAction,
  PermissionResourceType,
} from '../../generated/prisma/client.js';
import type {
  QuotationLineItem,
  QuotationSurchargeItem,
} from '../../generated/prisma/client.js';
import { CreateQuotationItemDto } from './dto/create-quotation-item.dto';
import { UpdateQuotationItemDto } from './dto/update-quotation-item.dto';
import { ReorderQuotationItemDto } from './dto/reorder-quotation-item.dto';
import { ApplyMarginTargetDto } from './dto/apply-margin-target.dto';
import { ApplyNegotiatedTotalDto } from './dto/apply-negotiated-total.dto';
import { CreateSurchargeItemDto } from './dto/create-surcharge-item.dto';
import { UpdateSurchargeItemDto } from './dto/update-surcharge-item.dto';
import { ReorderSurchargeItemDto } from './dto/reorder-surcharge-item.dto';

export interface QuotationItemNode {
  id: string;
  parentId: string | null;
  name: string;
  unit: string | null;
  sortOrder: number;
  quantity: number | null;
  unitPrice: number | null;
  costUnitPrice: number | null;
  marginAdjustedUnitPrice: number | null;
  negotiatedUnitPrice: number | null;
  note: string | null;
  isLeaf: boolean;
  complexPrice: number;
  costComplexPrice: number;
  profit: number;
  marginRate: number;
  marginAdjustedComplexPrice: number;
  negotiatedComplexPrice: number;
  children: QuotationItemNode[];
}

/**
 * 工程報價單 — 大項/中項/細項三層自由樹狀結構，20 大類只是預設可刪改的
 * 範本，不是固定清單（見 CreateQuotationItemDto）。金額欄位只在最底層細項
 * 才有意義；複價/成本複價/毛利率，以及往上彙總到大項/中項的總額，全部是
 * 讀取時現算（`buildTree`），不落地存衍生欄位。A（目標毛利率）/B（議價後
 * 總金額）兩種批次調整各自寫進獨立欄位，互不覆蓋 unitPrice 本身。
 */
@Injectable()
export class EngineeringQuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly permissionsService: PermissionsService,
    private readonly fieldChangeLog: FieldChangeLogService,
  ) {}

  async getTree(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);

    const items = await this.prisma.quotationLineItem.findMany({
      where: { quotationId: quotation.id },
      orderBy: { sortOrder: 'asc' },
    });
    const tree = this.buildTree(items);
    const grandTotalBeforeSurcharge = tree.reduce(
      (sum, n) => sum + n.complexPrice,
      0,
    );
    const grandCostTotalBeforeSurcharge = tree.reduce(
      (sum, n) => sum + n.costComplexPrice,
      0,
    );

    const surchargeItems = await this.prisma.quotationSurchargeItem.findMany({
      where: { quotationId: quotation.id },
      orderBy: { sortOrder: 'asc' },
    });
    const surcharges = this.computeSurcharges(
      surchargeItems,
      grandTotalBeforeSurcharge,
    );

    return {
      quotation,
      tree,
      grandTotalBeforeSurcharge,
      grandCostTotalBeforeSurcharge,
      surchargeItems: surcharges.items,
      surchargeTotal: surcharges.nonTaxSum + surcharges.taxSum,
      grandTotal:
        grandTotalBeforeSurcharge + surcharges.nonTaxSum + surcharges.taxSum,
    };
  }

  async createItem(
    userId: string,
    projectId: string,
    dto: CreateQuotationItemDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);

    if (dto.parentId) {
      await this.getItemOrThrow(quotation.id, dto.parentId);
    }

    const maxSortOrder = await this.prisma.quotationLineItem.aggregate({
      where: { quotationId: quotation.id, parentId: dto.parentId ?? null },
      _max: { sortOrder: true },
    });

    await this.prisma.quotationLineItem.create({
      data: {
        quotationId: quotation.id,
        parentId: dto.parentId ?? null,
        name: dto.name,
        unit: dto.unit,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        costUnitPrice: dto.costUnitPrice,
        note: dto.note,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
    return this.getTree(userId, projectId);
  }

  async updateItem(
    userId: string,
    projectId: string,
    itemId: string,
    dto: UpdateQuotationItemDto,
  ) {
    const project = await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);
    const existing = await this.getItemOrThrow(quotation.id, itemId);

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === itemId) {
        throw new BadRequestException('不能把工項掛到自己底下');
      }
      await this.getItemOrThrow(quotation.id, dto.parentId);
      const descendantIds = await this.getDescendantIds(quotation.id, itemId);
      if (descendantIds.has(dto.parentId)) {
        throw new BadRequestException('不能把工項移到自己的子項底下');
      }
    }

    // 欄位級唯讀限制（見 PermissionRule.readOnlyFields）——命中的欄位從
    // dto 靜默剔除,不拋錯，其餘欄位正常更新；下面的寫入跟 FieldChangeLog
    // 都直接讀過濾後的 dto，剔除的欄位自然落回 existing 的值，不會被誤判
    // 成「有變動」。
    const readOnlyFields = await this.permissionsService.getReadOnlyFields(
      userId,
      project.spaceId,
      PermissionResourceType.QUOTATION,
    );
    if (readOnlyFields.includes('quantity')) dto.quantity = undefined;
    if (readOnlyFields.includes('unitPrice')) dto.unitPrice = undefined;
    if (readOnlyFields.includes('costUnitPrice')) dto.costUnitPrice = undefined;

    await this.prisma.quotationLineItem.update({
      where: { id: itemId },
      data: {
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
        ...(dto.costUnitPrice !== undefined && {
          costUnitPrice: dto.costUnitPrice,
        }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });

    await this.fieldChangeLog.record({
      spaceId: project.spaceId,
      entityType: FieldChangeEntityType.QUOTATION_LINE_ITEM,
      entityId: itemId,
      entityLabel: `報價單項目「${existing.name}」`,
      changedByUserId: userId,
      // dto.<field> !== undefined (not ??) mirrors the write above exactly
      // — a field explicitly sent as null (clearing it) must show up as a
      // real change, not fall through to the old value.
      changes: [
        {
          field: 'quantity',
          label: '數量',
          oldValue: existing.quantity,
          newValue:
            dto.quantity !== undefined ? dto.quantity : existing.quantity,
        },
        {
          field: 'unitPrice',
          label: '單價',
          oldValue: existing.unitPrice,
          newValue:
            dto.unitPrice !== undefined ? dto.unitPrice : existing.unitPrice,
        },
        {
          field: 'costUnitPrice',
          label: '成本單價',
          oldValue: existing.costUnitPrice,
          newValue:
            dto.costUnitPrice !== undefined
              ? dto.costUnitPrice
              : existing.costUnitPrice,
        },
      ],
    });

    return this.getTree(userId, projectId);
  }

  async removeItem(userId: string, projectId: string, itemId: string) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);
    await this.getItemOrThrow(quotation.id, itemId);

    const descendantIds = await this.getDescendantIds(quotation.id, itemId);
    const allIds = [itemId, ...descendantIds];

    const inUse = await this.prisma.costControlRowQuotationItem.findFirst({
      where: { quotationLineItemId: { in: allIds } },
    });
    if (inUse) {
      throw new BadRequestException(
        '這個工項（或子項）已經被成控表勾選，不能刪除',
      );
    }
    const referencedByComparison =
      await this.prisma.procurementComparison.findFirst({
        where: { quotationLineItemId: { in: allIds } },
      });
    if (referencedByComparison) {
      throw new BadRequestException(
        '這個工項（或子項）已經有採發比價表，不能刪除',
      );
    }

    // 由深到淺刪，先刪最底層子孫再刪自己（self-relation 沒開 DB cascade）。
    const idsDeepestFirst = [...allIds].reverse();
    await this.prisma.$transaction(
      idsDeepestFirst.map((id) =>
        this.prisma.quotationLineItem.delete({ where: { id } }),
      ),
    );
    return this.getTree(userId, projectId);
  }

  async reorderItem(
    userId: string,
    projectId: string,
    itemId: string,
    dto: ReorderQuotationItemDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);
    const item = await this.getItemOrThrow(quotation.id, itemId);
    const target = await this.getItemOrThrow(quotation.id, dto.targetId);
    if (target.parentId !== item.parentId) {
      throw new BadRequestException('只能在同一層的工項之間排序');
    }

    const siblings = await this.prisma.quotationLineItem.findMany({
      where: { quotationId: quotation.id, parentId: item.parentId },
      orderBy: { sortOrder: 'asc' },
    });
    const withoutItem = siblings.filter((s) => s.id !== itemId);
    const targetIndex = withoutItem.findIndex((s) => s.id === dto.targetId);
    const insertIndex = dto.insertAfter ? targetIndex + 1 : targetIndex;
    withoutItem.splice(insertIndex, 0, item);

    await this.prisma.$transaction(
      withoutItem.map((sibling, index) =>
        this.prisma.quotationLineItem.update({
          where: { id: sibling.id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getTree(userId, projectId);
  }

  /** A方案——目標毛利率批次回推 marginAdjustedUnitPrice，只套用在有填成本
   * 的細項上（沒有成本就沒有毛利率可言），不覆蓋 unitPrice。 */
  async applyMarginTarget(
    userId: string,
    projectId: string,
    dto: ApplyMarginTargetDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);
    if (dto.targetMarginPercent >= 100) {
      throw new BadRequestException('目標毛利率必須小於 100%');
    }

    const items = await this.prisma.quotationLineItem.findMany({
      where: {
        quotationId: quotation.id,
        costUnitPrice: { not: null },
        ...(dto.itemIds?.length ? { id: { in: dto.itemIds } } : {}),
      },
    });
    if (items.length === 0) {
      throw new BadRequestException('沒有可以套用的工項（要先填成本單價）');
    }

    const divisor = 1 - dto.targetMarginPercent / 100;
    await this.prisma.$transaction([
      ...items.map((item) =>
        this.prisma.quotationLineItem.update({
          where: { id: item.id },
          data: { marginAdjustedUnitPrice: item.costUnitPrice! / divisor },
        }),
      ),
      this.prisma.engineeringQuotation.update({
        where: { id: quotation.id },
        data: { lastTargetMarginPercent: dto.targetMarginPercent },
      }),
    ]);
    return this.getTree(userId, projectId);
  }

  /** B方案——議價後總金額，依現有複價佔比分攤回推 negotiatedUnitPrice，
   * 不覆蓋 unitPrice。 */
  async applyNegotiatedTotal(
    userId: string,
    projectId: string,
    dto: ApplyNegotiatedTotalDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);

    const items = await this.prisma.quotationLineItem.findMany({
      where: {
        quotationId: quotation.id,
        unitPrice: { not: null },
        quantity: { not: null },
        ...(dto.itemIds?.length ? { id: { in: dto.itemIds } } : {}),
      },
    });
    if (items.length === 0) {
      throw new BadRequestException('沒有可以套用的工項（要先填單價與數量）');
    }
    const currentTotal = items.reduce(
      (sum, item) => sum + item.unitPrice! * item.quantity!,
      0,
    );
    if (currentTotal <= 0) {
      throw new BadRequestException(
        '目前選取的工項複價總和是 0，無法依比例分攤',
      );
    }
    const ratio = dto.negotiatedTotalAmount / currentTotal;

    await this.prisma.$transaction([
      ...items.map((item) =>
        this.prisma.quotationLineItem.update({
          where: { id: item.id },
          data: { negotiatedUnitPrice: item.unitPrice! * ratio },
        }),
      ),
      this.prisma.engineeringQuotation.update({
        where: { id: quotation.id },
        data: { lastNegotiatedTotalAmount: dto.negotiatedTotalAmount },
      }),
    ]);
    return this.getTree(userId, projectId);
  }

  // --- 附加費用（總表） ------------------------------------------------

  async createSurcharge(
    userId: string,
    projectId: string,
    dto: CreateSurchargeItemDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);
    const maxSortOrder = await this.prisma.quotationSurchargeItem.aggregate({
      where: { quotationId: quotation.id },
      _max: { sortOrder: true },
    });
    await this.prisma.quotationSurchargeItem.create({
      data: {
        quotationId: quotation.id,
        name: dto.name,
        percent: dto.percent,
        isTaxLike: dto.isTaxLike ?? false,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
    return this.getTree(userId, projectId);
  }

  async updateSurcharge(
    userId: string,
    projectId: string,
    surchargeId: string,
    dto: UpdateSurchargeItemDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);
    await this.getSurchargeOrThrow(quotation.id, surchargeId);
    await this.prisma.quotationSurchargeItem.update({
      where: { id: surchargeId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.percent !== undefined && { percent: dto.percent }),
        ...(dto.isTaxLike !== undefined && { isTaxLike: dto.isTaxLike }),
      },
    });
    return this.getTree(userId, projectId);
  }

  async removeSurcharge(
    userId: string,
    projectId: string,
    surchargeId: string,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);
    await this.getSurchargeOrThrow(quotation.id, surchargeId);
    await this.prisma.quotationSurchargeItem.delete({
      where: { id: surchargeId },
    });
    return this.getTree(userId, projectId);
  }

  async reorderSurcharge(
    userId: string,
    projectId: string,
    surchargeId: string,
    dto: ReorderSurchargeItemDto,
  ) {
    await this.getAuthorizedProjectForWrite(userId, projectId);
    const quotation = await this.getOrCreateQuotation(projectId);
    const item = await this.getSurchargeOrThrow(quotation.id, surchargeId);
    await this.getSurchargeOrThrow(quotation.id, dto.targetId);

    const siblings = await this.prisma.quotationSurchargeItem.findMany({
      where: { quotationId: quotation.id },
      orderBy: { sortOrder: 'asc' },
    });
    const withoutItem = siblings.filter((s) => s.id !== surchargeId);
    const targetIndex = withoutItem.findIndex((s) => s.id === dto.targetId);
    const insertIndex = dto.insertAfter ? targetIndex + 1 : targetIndex;
    withoutItem.splice(insertIndex, 0, item);

    await this.prisma.$transaction(
      withoutItem.map((sibling, index) =>
        this.prisma.quotationSurchargeItem.update({
          where: { id: sibling.id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getTree(userId, projectId);
  }

  // --- internals ---------------------------------------------------------

  /** 給其他 service（成控/採發比價表）用——確保這個專案的報價單表頭一定
   * 存在，不用每個呼叫端各自處理「還沒建立」的情況。 */
  async getOrCreateQuotation(projectId: string) {
    return this.prisma.engineeringQuotation.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
  }

  /** 給成控表/採發比價表用——不分層級（大項/中項/細項皆可）查任一工項目前
   * 已經現算好的複價/成本複價/議價後複價彙總值，讓「成控列勾選了報價單哪個
   * 節點」不用管那個節點是不是葉節點，一律拿它自己（含底下子孫）的彙總。 */
  async getComputedItemsById(
    projectId: string,
  ): Promise<Map<string, QuotationItemNode>> {
    const quotation = await this.getOrCreateQuotation(projectId);
    const items = await this.prisma.quotationLineItem.findMany({
      where: { quotationId: quotation.id },
      orderBy: { sortOrder: 'asc' },
    });
    const tree = this.buildTree(items);
    const map = new Map<string, QuotationItemNode>();
    const walk = (nodes: QuotationItemNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        walk(node.children);
      }
    };
    walk(tree);
    return map;
  }

  /** 給①初始管制表用——報價單的頂層大項清單（已含彙總後的業主報價/成本）。 */
  async getTopLevelItems(projectId: string): Promise<QuotationItemNode[]> {
    const quotation = await this.getOrCreateQuotation(projectId);
    const items = await this.prisma.quotationLineItem.findMany({
      where: { quotationId: quotation.id },
      orderBy: { sortOrder: 'asc' },
    });
    return this.buildTree(items);
  }

  private buildTree(items: QuotationLineItem[]): QuotationItemNode[] {
    const childrenByParent = new Map<string | null, QuotationLineItem[]>();
    for (const item of items) {
      const key = item.parentId;
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key)!.push(item);
    }

    const build = (item: QuotationLineItem): QuotationItemNode => {
      const childItems = childrenByParent.get(item.id) ?? [];
      const isLeaf = childItems.length === 0;
      const children = childItems.map(build);

      if (isLeaf) {
        const quantity = item.quantity ?? 0;
        const complexPrice = (item.unitPrice ?? 0) * quantity;
        const costComplexPrice = (item.costUnitPrice ?? 0) * quantity;
        const marginAdjustedComplexPrice =
          item.marginAdjustedUnitPrice != null
            ? item.marginAdjustedUnitPrice * quantity
            : complexPrice;
        const negotiatedComplexPrice =
          item.negotiatedUnitPrice != null
            ? item.negotiatedUnitPrice * quantity
            : complexPrice;
        const profit = complexPrice - costComplexPrice;
        return {
          id: item.id,
          parentId: item.parentId,
          name: item.name,
          unit: item.unit,
          sortOrder: item.sortOrder,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costUnitPrice: item.costUnitPrice,
          marginAdjustedUnitPrice: item.marginAdjustedUnitPrice,
          negotiatedUnitPrice: item.negotiatedUnitPrice,
          note: item.note,
          isLeaf: true,
          complexPrice,
          costComplexPrice,
          profit,
          marginRate: complexPrice !== 0 ? profit / complexPrice : 0,
          marginAdjustedComplexPrice,
          negotiatedComplexPrice,
          children: [],
        };
      }

      const complexPrice = children.reduce((sum, c) => sum + c.complexPrice, 0);
      const costComplexPrice = children.reduce(
        (sum, c) => sum + c.costComplexPrice,
        0,
      );
      const marginAdjustedComplexPrice = children.reduce(
        (sum, c) => sum + c.marginAdjustedComplexPrice,
        0,
      );
      const negotiatedComplexPrice = children.reduce(
        (sum, c) => sum + c.negotiatedComplexPrice,
        0,
      );
      const profit = complexPrice - costComplexPrice;
      return {
        id: item.id,
        parentId: item.parentId,
        name: item.name,
        unit: item.unit,
        sortOrder: item.sortOrder,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        costUnitPrice: item.costUnitPrice,
        marginAdjustedUnitPrice: item.marginAdjustedUnitPrice,
        negotiatedUnitPrice: item.negotiatedUnitPrice,
        note: item.note,
        isLeaf: false,
        complexPrice,
        costComplexPrice,
        profit,
        marginRate: complexPrice !== 0 ? profit / complexPrice : 0,
        marginAdjustedComplexPrice,
        negotiatedComplexPrice,
        children,
      };
    };

    return (childrenByParent.get(null) ?? []).map(build);
  }

  private computeSurcharges(
    items: QuotationSurchargeItem[],
    baseAmount: number,
  ) {
    const nonTaxAmounts = new Map(
      items
        .filter((i) => !i.isTaxLike)
        .map((i) => [i.id, (baseAmount * i.percent) / 100]),
    );
    const nonTaxSum = [...nonTaxAmounts.values()].reduce(
      (sum, a) => sum + a,
      0,
    );
    const taxBase = baseAmount + nonTaxSum;
    const taxAmounts = new Map(
      items
        .filter((i) => i.isTaxLike)
        .map((i) => [i.id, (taxBase * i.percent) / 100]),
    );
    const taxSum = [...taxAmounts.values()].reduce((sum, a) => sum + a, 0);

    return {
      items: items.map((i) => ({
        ...i,
        amount: (i.isTaxLike ? taxAmounts : nonTaxAmounts).get(i.id)!,
      })),
      nonTaxSum,
      taxSum,
    };
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  /** Same as `getAuthorizedProject` plus the QUOTATION/WRITE permission-
   * engine check — every mutating endpoint on this service uses this
   * instead; `getTree` (the only read) keeps using the plain one above. */
  private async getAuthorizedProjectForWrite(
    userId: string,
    projectId: string,
  ) {
    const project = await this.getAuthorizedProject(userId, projectId);
    await this.permissionsService.assertCan(
      userId,
      project.spaceId,
      PermissionResourceType.QUOTATION,
      PermissionAction.WRITE,
    );
    return project;
  }

  /** 報價單 PDF 匯出/列印是純前端渲染（見 App 端
   * `services/export/quotation_export_service.dart`），資料早就透過
   * `getTree`（讀取，不受限）給前端了，沒有天然的後端寫入關口可以擋。App
   * 改成進畫面時先問這個端點決定要不要顯示匯出/列印按鈕——2026-09 使用者
   * 確認的做法，是介面層的把關，不是真正的資料保護。 */
  async checkExportPermission(userId: string, projectId: string) {
    const project = await this.getAuthorizedProject(userId, projectId);
    const allowed = await this.permissionsService.can(
      userId,
      project.spaceId,
      PermissionResourceType.QUOTATION,
      PermissionAction.EXPORT,
    );
    return { allowed };
  }

  private async getItemOrThrow(
    quotationId: string,
    itemId: string,
  ): Promise<QuotationLineItem> {
    const item = await this.prisma.quotationLineItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.quotationId !== quotationId) {
      throw new NotFoundException('Quotation line item not found');
    }
    return item;
  }

  private async getSurchargeOrThrow(
    quotationId: string,
    surchargeId: string,
  ): Promise<QuotationSurchargeItem> {
    const item = await this.prisma.quotationSurchargeItem.findUnique({
      where: { id: surchargeId },
    });
    if (!item || item.quotationId !== quotationId) {
      throw new NotFoundException('Surcharge item not found');
    }
    return item;
  }

  private async getDescendantIds(
    quotationId: string,
    itemId: string,
  ): Promise<Set<string>> {
    const all = await this.prisma.quotationLineItem.findMany({
      where: { quotationId },
      select: { id: true, parentId: true },
    });
    const childrenByParent = new Map<string, string[]>();
    for (const item of all) {
      if (!item.parentId) continue;
      if (!childrenByParent.has(item.parentId))
        childrenByParent.set(item.parentId, []);
      childrenByParent.get(item.parentId)!.push(item.id);
    }
    const result = new Set<string>();
    const stack = [...(childrenByParent.get(itemId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (result.has(id)) continue;
      result.add(id);
      stack.push(...(childrenByParent.get(id) ?? []));
    }
    return result;
  }
}
