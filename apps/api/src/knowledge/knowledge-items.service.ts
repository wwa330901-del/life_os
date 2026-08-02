import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeItemStatus, Prisma } from '../../generated/prisma/client.js';
import { KnowledgeCategoriesService } from './knowledge-categories.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { ContentAnalysisResult } from './ai/ai-content-analysis.interface';

const itemInclude = {
  category: true,
  fieldValues: { include: { definition: true, option: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.KnowledgeItemInclude;

type ItemWithRelations = Prisma.KnowledgeItemGetPayload<{
  include: typeof itemInclude;
}>;

@Injectable()
export class KnowledgeItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: KnowledgeCategoriesService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  /** LINE has no API for a third-party desktop app to share directly to a
   * specific friend — this pushes the link+summary to the caller's own
   * LINE chat with 元序生活, which they can then forward themselves using
   * LINE's built-in forward (works fine here since it's a plain text
   * message, not a flex/notification card). */
  async shareToOwnLine(userId: string, itemId: string) {
    const item = await this.getDetail(userId, itemId);
    const lines = [item.title ?? '未命名', item.summary ?? '', item.sourceUrl ?? ''].filter(Boolean);
    await this.lineNotifier.notifyByUser(userId, lines.join('\n'));
  }

  async createPending(
    ownerUserId: string,
    params: { sourceUrl?: string; sourcePlatform: string },
  ) {
    return this.prisma.knowledgeItem.create({
      data: {
        ownerUserId,
        sourceUrl: params.sourceUrl,
        sourcePlatform: params.sourcePlatform,
        status: KnowledgeItemStatus.PENDING,
      },
    });
  }

  async markProcessing(itemId: string) {
    await this.prisma.knowledgeItem.update({
      where: { id: itemId },
      data: { status: KnowledgeItemStatus.PROCESSING },
    });
  }

  /** Internal, permission-check-free lookup for the analysis pipeline
   * (system-initiated, not a user request) — see getDetail for the
   * permission-checked, caller-facing equivalent. */
  async getByIdInternal(itemId: string) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('Knowledge item not found');
    return item;
  }

  async setExhibitionDecision(
    itemId: string,
    status: 'SCHEDULED' | 'CANCELLED',
    plannedAt?: Date,
  ) {
    await this.prisma.knowledgeItem.update({
      where: { id: itemId },
      data: {
        exhibitionDecisionStatus: status,
        exhibitionPlannedAt: plannedAt,
      },
    });
  }

  async updateSourcePlatform(itemId: string, sourcePlatform: string) {
    await this.prisma.knowledgeItem.update({
      where: { id: itemId },
      data: { sourcePlatform },
    });
  }

  async markFailed(itemId: string, message: string) {
    await this.prisma.knowledgeItem.update({
      where: { id: itemId },
      data: { status: KnowledgeItemStatus.FAILED, errorMessage: message },
    });
  }

  async applyAnalysisResult(
    itemId: string,
    rawContent: string | undefined,
    result: ContentAnalysisResult,
  ): Promise<
    | { status: 'DONE'; categoryName: string }
    | { status: 'AWAITING_CATEGORY_DECISION'; suggestedCategoryName: string }
  > {
    if (result.matched) {
      const category = await this.prisma.knowledgeCategory.findUniqueOrThrow({
        where: { id: result.categoryId },
      });
      await this.prisma.knowledgeItem.update({
        where: { id: itemId },
        data: {
          categoryId: result.categoryId,
          title: result.title,
          summary: result.summary,
          tags: result.tags,
          rawContent,
          status: KnowledgeItemStatus.DONE,
        },
      });
      await this.applyFieldValues(
        itemId,
        result.categoryId,
        result.fieldValues,
      );
      return { status: 'DONE', categoryName: category.name };
    }

    await this.prisma.knowledgeItem.update({
      where: { id: itemId },
      data: {
        title: result.title,
        summary: result.summary,
        tags: result.tags,
        rawContent,
        suggestedCategoryName: result.suggestedCategoryName,
        suggestedFields: result.suggestedFields,
        status: KnowledgeItemStatus.AWAITING_CATEGORY_DECISION,
      },
    });
    return {
      status: 'AWAITING_CATEGORY_DECISION',
      suggestedCategoryName: result.suggestedCategoryName,
    };
  }

  /** Called when the user replies to "建議新增 XX 分類" — either "新增" (create
   * the suggested category as-is) or an existing category's name (file it
   * there instead). Field values aren't re-extracted for the now-resolved
   * category in either branch — the AI only ever computes field values for
   * the one category it actually matched against, and this whole method
   * only runs when it didn't match one; the user can fill values in by hand
   * afterwards if they want them. */
  async resolveCategoryDecision(
    userId: string,
    itemId: string,
    replyText: string,
  ) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.ownerUserId !== userId) {
      throw new NotFoundException('Knowledge item not found');
    }
    if (item.status !== KnowledgeItemStatus.AWAITING_CATEGORY_DECISION) {
      throw new BadRequestException('這筆資料目前不是在等待分類決定的狀態');
    }

    const trimmed = replyText.trim();
    if (trimmed === '新增') {
      const suggestedFields =
        (item.suggestedFields as { name: string; type: never }[] | null) ?? [];
      const category = await this.categoriesService.createFromSuggestion(
        userId,
        item.suggestedCategoryName ?? '未分類',
        suggestedFields,
      );
      await this.prisma.knowledgeItem.update({
        where: { id: itemId },
        data: { categoryId: category.id, status: KnowledgeItemStatus.DONE },
      });
      return category.name;
    }

    const existing = await this.categoriesService.findByNameForUser(
      userId,
      trimmed,
    );
    if (!existing) {
      throw new BadRequestException(
        '請回覆「新增」建立建議的分類，或回覆一個你現有分類的名稱',
      );
    }
    await this.prisma.knowledgeItem.update({
      where: { id: itemId },
      data: { categoryId: existing.id, status: KnowledgeItemStatus.DONE },
    });
    return existing.name;
  }

  async listOwn(
    userId: string,
    filter: { categoryId?: string; search?: string } = {},
  ) {
    return this.prisma.knowledgeItem.findMany({
      where: {
        ownerUserId: userId,
        categoryId: filter.categoryId,
        ...(filter.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                { summary: { contains: filter.search, mode: 'insensitive' } },
                { tags: { has: filter.search } },
              ],
            }
          : {}),
      },
      include: itemInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listPublicFromOthers(
    viewerUserId: string,
    filter: { categoryId?: string; ownerUserId?: string; search?: string } = {},
  ) {
    const items = await this.prisma.knowledgeItem.findMany({
      where: {
        status: KnowledgeItemStatus.DONE,
        ownerUserId: filter.ownerUserId ?? { not: viewerUserId },
        categoryId: filter.categoryId,
        category: { isPublic: true },
        ...(filter.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                { summary: { contains: filter.search, mode: 'insensitive' } },
                { tags: { has: filter.search } },
              ],
            }
          : {}),
      },
      include: itemInclude,
      orderBy: { createdAt: 'desc' },
    });
    return items.filter(
      (item) => !item.category?.blacklistedUserIds.includes(viewerUserId),
    );
  }

  async getDetail(
    viewerUserId: string,
    itemId: string,
  ): Promise<ItemWithRelations> {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id: itemId },
      include: itemInclude,
    });
    if (!item) throw new NotFoundException('Knowledge item not found');
    if (item.ownerUserId === viewerUserId) return item;
    if (
      item.category?.isPublic &&
      !item.category.blacklistedUserIds.includes(viewerUserId)
    )
      return item;
    throw new ForbiddenException('沒有權限查看這筆資料');
  }

  async remove(userId: string, itemId: string) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.ownerUserId !== userId) {
      throw new NotFoundException('Knowledge item not found');
    }
    await this.prisma.knowledgeItem.delete({ where: { id: itemId } });
  }

  /** "存一份到我的知識庫" on someone else's public item — re-submits the
   * original URL as a brand-new PENDING item owned by the viewer, so it
   * runs back through the normal analysis pipeline and gets classified
   * against the VIEWER's own categories/fields rather than copying the
   * original owner's field layout verbatim. */
  async saveCopy(viewerUserId: string, itemId: string) {
    const item = await this.getDetail(viewerUserId, itemId);
    if (!item.sourceUrl) {
      throw new BadRequestException('這筆資料沒有原始連結，無法另存');
    }
    return this.createPending(viewerUserId, {
      sourceUrl: item.sourceUrl,
      sourcePlatform: item.sourcePlatform ?? '',
    });
  }

  /** 美食/景點 LINE query — matches the category's "地址" field's text value
   * against `locationText` as a case-insensitive substring, across the
   * caller's own items plus any visible public items in a same-named
   * category from other users. */
  async searchByLocation(
    userId: string,
    categoryName: string,
    locationText: string,
  ) {
    const candidateCategoryIds = await this.categoryIdsVisibleTo(
      userId,
      categoryName,
    );
    if (candidateCategoryIds.length === 0) return [];

    const items = await this.prisma.knowledgeItem.findMany({
      where: {
        status: KnowledgeItemStatus.DONE,
        categoryId: { in: candidateCategoryIds },
        fieldValues: {
          some: {
            definition: { name: '地址' },
            textValue: { contains: locationText, mode: 'insensitive' },
          },
        },
      },
      include: itemInclude,
    });
    return items.filter(
      (item) =>
        item.ownerUserId === userId || this.isVisiblePublic(item, userId),
    );
  }

  /** 展覽 LINE query — every visible 展覽資訊 item sorted by 結束日期 ascending
   * (soonest-ending first), regardless of location. */
  async listUpcomingExhibitions(userId: string) {
    const candidateCategoryIds = await this.categoryIdsVisibleTo(
      userId,
      '展覽資訊',
    );
    if (candidateCategoryIds.length === 0) return [];

    const items = await this.prisma.knowledgeItem.findMany({
      where: {
        status: KnowledgeItemStatus.DONE,
        categoryId: { in: candidateCategoryIds },
      },
      include: itemInclude,
    });
    const visible = items.filter(
      (item) =>
        item.ownerUserId === userId || this.isVisiblePublic(item, userId),
    );

    const withEndDate = visible
      .map((item) => ({ item, endDate: this.fieldDateValue(item, '結束日期') }))
      .filter(
        (entry): entry is { item: ItemWithRelations; endDate: Date } =>
          entry.endDate !== null,
      )
      .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

    return withEndDate.map((entry) => entry.item);
  }

  fieldTextValue(item: ItemWithRelations, fieldName: string): string | null {
    const value = item.fieldValues.find((v) => v.definition.name === fieldName);
    return value?.textValue ?? value?.option?.label ?? null;
  }

  fieldDateValue(item: ItemWithRelations, fieldName: string): Date | null {
    return (
      item.fieldValues.find((v) => v.definition.name === fieldName)
        ?.dateValue ?? null
    );
  }

  fieldBooleanValue(
    item: ItemWithRelations,
    fieldName: string,
  ): boolean | null {
    const value = item.fieldValues.find((v) => v.definition.name === fieldName);
    return value?.booleanValue ?? null;
  }

  private isVisiblePublic(
    item: ItemWithRelations,
    viewerUserId: string,
  ): boolean {
    return (
      Boolean(item.category?.isPublic) &&
      !item.category?.blacklistedUserIds.includes(viewerUserId)
    );
  }

  /** This user's own category with this name (if any) plus every other
   * user's public, non-blacklisting category with the same name. */
  private async categoryIdsVisibleTo(
    userId: string,
    categoryName: string,
  ): Promise<string[]> {
    const categories = await this.prisma.knowledgeCategory.findMany({
      where: { name: categoryName },
    });
    return categories
      .filter(
        (category) =>
          category.ownerUserId === userId ||
          (category.isPublic && !category.blacklistedUserIds.includes(userId)),
      )
      .map((category) => category.id);
  }

  private async applyFieldValues(
    itemId: string,
    categoryId: string,
    values: Record<string, string>,
  ) {
    const definitions = await this.prisma.knowledgeFieldDefinition.findMany({
      where: { categoryId },
    });

    for (const definition of definitions) {
      const rawValue = values[definition.name];
      if (rawValue === undefined) continue;

      const data: Prisma.KnowledgeFieldValueUncheckedCreateInput = {
        itemId,
        definitionId: definition.id,
      };
      switch (definition.type) {
        case 'NUMBER': {
          const numeric = Number(rawValue);
          if (!Number.isNaN(numeric)) data.numberValue = numeric;
          break;
        }
        case 'DATE': {
          const parsed = new Date(rawValue);
          if (!Number.isNaN(parsed.getTime())) data.dateValue = parsed;
          break;
        }
        case 'BOOLEAN':
          data.booleanValue = /^(true|是|yes)$/i.test(rawValue.trim());
          break;
        case 'SELECT':
          data.optionId = await this.categoriesService.resolveSelectOptionId(
            definition.id,
            rawValue,
          );
          break;
        default:
          data.textValue = rawValue;
      }

      await this.prisma.knowledgeFieldValue.upsert({
        where: { itemId_definitionId: { itemId, definitionId: definition.id } },
        create: data,
        update: data,
      });
    }
  }
}
