import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeItemsService } from './knowledge-items.service';

const SUMMARY_MAX = 120;
const RESULT_MAX = 10;

/** Gemini Interactions API tool declarations for 知識庫 (read-only) —
 * shared by the LINE 萬用 AI and the App's AI 問答. */
export const KNOWLEDGE_TOOLS = [
  {
    type: 'function' as const,
    name: 'search_knowledge',
    description:
      '搜尋使用者知識庫裡自己收藏的內容（文章、影片、筆記、美食、景點…）。keyword 比對標題、摘要、標籤；categoryName 是知識庫分類名稱（可不填）。兩個都不填＝最近收藏的。',
    parameters: {
      type: 'object',
      properties: { keyword: { type: 'string' }, categoryName: { type: 'string' } },
    },
  },
  {
    type: 'function' as const,
    name: 'search_places_near',
    description: '用地點找收藏過的美食或景點（比對地址），例如「信義區有什麼好吃的」→ categoryName=美食、location=信義。',
    parameters: {
      type: 'object',
      properties: {
        categoryName: { type: 'string', enum: ['美食', '景點'] },
        location: { type: 'string' },
      },
      required: ['categoryName', 'location'],
    },
  },
  {
    type: 'function' as const,
    name: 'list_upcoming_exhibitions',
    description: '列出收藏的展覽（依結束日期排序，含是否已觀展）。',
    parameters: { type: 'object', properties: {} },
  },
];

export const KNOWLEDGE_AI_GUIDE =
  '問「之前存過的 XX」「附近有什麼好吃的」「有什麼展可以看」→ search_knowledge／search_places_near／list_upcoming_exhibitions 查真實收藏再回答，沒有就老實說沒有收藏過。';

type Item = Awaited<ReturnType<KnowledgeItemsService['listUpcomingExhibitions']>>[number];

@Injectable()
export class KnowledgeAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: KnowledgeItemsService,
  ) {}

  static readonly toolNames = new Set(KNOWLEDGE_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'search_knowledge':
        return this.search(userId, args);
      case 'search_places_near': {
        const found = await this.items.searchByLocation(userId, String(args.categoryName), String(args.location ?? '').trim());
        return found.slice(0, RESULT_MAX).map((item) => this.describe(item));
      }
      case 'list_upcoming_exhibitions': {
        const found = await this.items.listUpcomingExhibitions(userId);
        return found.slice(0, RESULT_MAX).map((item) => ({
          ...this.describe(item),
          endDate: this.items.fieldDateValue(item, '結束日期')?.toISOString().slice(0, 10) ?? null,
          visited: this.items.fieldBooleanValue(item, '是否已觀展') ?? false,
        }));
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }

  private async search(userId: string, args: Record<string, unknown>) {
    const keyword = typeof args.keyword === 'string' && args.keyword.trim() ? args.keyword.trim() : undefined;
    const categoryName = typeof args.categoryName === 'string' ? args.categoryName.trim() : '';
    let categoryId: string | undefined;
    if (categoryName) {
      const categories = await this.prisma.knowledgeCategory.findMany({
        where: { ownerUserId: userId },
        select: { id: true, name: true },
      });
      const category =
        categories.find((c) => c.name === categoryName) ??
        categories.find((c) => c.name.includes(categoryName) || categoryName.includes(c.name));
      if (!category) throw new Error(`知識庫沒有「${categoryName}」這個分類，可用的：${categories.map((c) => c.name).join('、')}`);
      categoryId = category.id;
    }
    const page = await this.items.listOwn(userId, { search: keyword, categoryId, take: RESULT_MAX });
    return page.items.map((item) => this.describe(item));
  }

  private describe(item: Item) {
    const summary = item.summary ?? '';
    return {
      title: item.title ?? '未命名',
      category: item.category?.name ?? null,
      summary: summary.length > SUMMARY_MAX ? `${summary.slice(0, SUMMARY_MAX)}…` : summary,
      address: this.items.fieldTextValue(item, '地址'),
      url: item.sourceUrl ?? null,
    };
  }
}
