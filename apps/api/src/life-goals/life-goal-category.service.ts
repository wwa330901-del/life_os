import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { category: { type: 'string' } },
  required: ['category'],
};

/** AI 自動分類 (2026-09-30, user's rule): put a goal into the user's own
 * existing category that means the same kind of thing (「閱讀一本書」→ 已有
 * 的「看書」), but never merge different kinds of activity just because they
 * share a broader umbrella (閱讀 and 上課 are both 學習 yet completely
 * different). Only the user's OWN categories are candidates — the App's
 * preset chips (財務/健康/學習…) are deliberately left out, since mapping
 * onto those broad buckets is exactly the over-merging the user rejected.
 * No close match → a new, specific category name. */
@Injectable()
export class LifeGoalCategoryService {
  private readonly logger = new Logger(LifeGoalCategoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly aiUsage: AiUsageService,
  ) {}

  /** Returns null (caller keeps whatever the user typed) when the user has
   * no Gemini key or the call fails — categorizing is a nicety, never a
   * reason to block saving a goal. */
  async suggest(userId: string, title: string, typedCategory?: string | null): Promise<{ category: string | null }> {
    const user = await this.users.findById(userId);
    if (!user?.geminiApiKey) return { category: null };

    const existing = (
      await this.prisma.lifeGoal.findMany({
        where: { ownerUserId: userId, category: { not: null } },
        select: { category: true },
        distinct: ['category'],
      })
    ).map((g) => g.category!);

    const typed = typedCategory?.trim() || null;
    if (typed && existing.includes(typed)) return { category: typed };

    const prompt = [
      '幫一個人生目標挑分類。',
      `目標：${title}`,
      typed ? `使用者自己打的分類：${typed}` : '使用者沒有指定分類。',
      `使用者已有的分類：${existing.length > 0 ? existing.join('、') : '（無）'}`,
      '規則：',
      '1. 已有分類裡如果有「同一種事情」的（只是說法不同，例如「閱讀」跟「看書」），就用那個已有分類，一字不改。',
      '2. 不要只因為上位概念相同就合併：閱讀跟上課都算學習，但它們是完全不同類型，不能放一起。',
      '3. 都不是同一種事情，就用一個新的、具體的分類名稱（2～4 個字）；使用者有打分類就直接用他打的。',
      '只回傳 JSON：{"category": "分類名稱"}',
    ].join('\n');

    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const client = new GoogleGenAI({ apiKey: user.geminiApiKey });
      const interaction = await client.interactions.create({
        model: GEMINI_MODEL,
        input: prompt,
        response_format: { type: 'text', mime_type: 'application/json', schema: RESPONSE_SCHEMA },
      });
      inputTokens = interaction.usage?.total_input_tokens ?? 0;
      outputTokens = interaction.usage?.total_output_tokens ?? 0;
      const category = (JSON.parse(interaction.output_text ?? '{}') as { category?: string }).category?.trim() || null;
      await this.aiUsage.record({
        userId,
        feature: 'life_goal_category',
        model: GEMINI_MODEL,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });
      return { category };
    } catch (error) {
      this.logger.warn(`人生目標自動分類失敗：${error}`);
      await this.aiUsage.record({
        userId,
        feature: 'life_goal_category',
        model: GEMINI_MODEL,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { category: null };
    }
  }
}
