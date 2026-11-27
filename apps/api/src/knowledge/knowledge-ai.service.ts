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
      '搜尋使用者的「大腦」（知識庫）裡自己收藏的內容（文章、影片、截圖、美食、景點、展覽…）。keyword 可以放好幾個字用空白隔開（例如「台南 咖啡」），每個字都會比對標題、摘要、原文全文、標籤、主題、地址等重點；categoryName 是舊的分類名稱（通常不用填）。都不填＝最近收藏的。回傳每則的主題、摘要、跟關鍵字有關的原文片段（quote）。',
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
    description: '列出大腦裡還沒結束的展覽、活動（快結束的在前面，含開始、結束日期）。',
    parameters: { type: 'object', properties: {} },
  },
];

export const KNOWLEDGE_AI_GUIDE =
  '問「我存過／大腦裡／之前那篇 XX」「附近有什麼好吃的」「有什麼展可以看」→ search_knowledge／search_places_near／list_upcoming_exhibitions 查真實收藏再回答：只根據查到的內容講，提到哪一則就說出它的標題，有原文片段（quote）就引用一句當出處；查不到換個關鍵字（拆短一點）再試一次，還是沒有就老實說大腦裡沒有存過。';

type Item = Awaited<ReturnType<KnowledgeItemsService['listUpcomingExhibitions']>>[number];

@Injectable()
export class KnowledgeAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: KnowledgeItemsService,
  ) {}

  static readonly toolNames = new Set(KNOWLEDGE_TOOLS.map((t) => t.name));

  /** 給 describe 抓原文片段用（同一個請求內，search 後馬上 describe）。 */
  private lastKeyword: string | undefined;

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
          startDate: item.eventStartDate?.toISOString().slice(0, 10) ?? null,
          endDate: item.eventEndDate?.toISOString().slice(0, 10) ?? null,
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
    this.lastKeyword = keyword;
    const page = await this.items.listOwn(userId, { search: keyword, categoryId, take: RESULT_MAX });
    return page.items.map((item) => this.describe(item));
  }

  private describe(item: Item) {
    const summary = item.summary ?? '';
    return {
      title: item.title ?? '未命名',
      category: item.category?.name ?? null,
      topics: item.topics.map((t) => t.topic.name),
      summary: summary.length > SUMMARY_MAX ? `${summary.slice(0, SUMMARY_MAX)}…` : summary,
      quote: quoteAround(item.rawContent, this.lastKeyword),
      eventEndDate: item.eventEndDate?.toISOString().slice(0, 10) ?? null,
      address: this.items.fieldTextValue(item, '地址'),
      url: item.sourceUrl ?? null,
    };
  }
}

/** 原文裡第一個關鍵字附近的一小段（AI 回答時引用當出處）。沒有關鍵字就給開頭。 */
export function quoteAround(text: string | null | undefined, keyword: string | undefined, size = 160): string | null {
  if (!text) return null;
  const clean = text.replace(/s+/g, ' ').trim();
  if (!clean) return null;
  const words = (keyword ?? '').trim().split(/s+/).filter(Boolean);
  let at = -1;
  for (const w of words) {
    at = clean.toLowerCase().indexOf(w.toLowerCase());
    if (at >= 0) break;
  }
  const start = at < 0 ? 0 : Math.max(0, at - size / 3);
  const piece = clean.slice(start, start + size);
  return `${start > 0 ? '…' : ''}${piece}${start + size < clean.length ? '…' : ''}`;
}
