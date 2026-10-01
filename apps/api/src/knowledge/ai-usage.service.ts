import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';
import { taipeiDateKeyToUtcMidnight, taipeiTodayRange } from '../common/taipei-date';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 台北時間的今天、近 7 天、本月起點（UTC instant）。 */
export function taipeiUsageWindows() {
  const todayStart = taipeiTodayRange().start;
  const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  const shifted = new Date(todayStart.getTime() + 8 * 60 * 60 * 1000);
  const monthKey = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const monthStart = new Date(taipeiDateKeyToUtcMidnight(monthKey).getTime() - 8 * 60 * 60 * 1000);
  return { todayStart, weekStart, monthStart };
}

/** 每個 feature 的中文名稱（AI 用量頁、LINE「AI 用量」用）。 */
export const AI_FEATURE_LABEL: Record<string, string> = {
  knowledge: '知識庫分析',
  line_ai_agent: 'LINE AI 對話',
  ai_assistant_app: 'App AI 問答',
  ai_assistant_line: 'LINE 查詢',
  divination: '算命解卦',
  finance_plan: '理財評估',
  life_goal_category: '目標分類',
  life_review: '週/月回顧總結',
  receipt: '收據辨識',
  voice: '語音轉文字',
};

export const featureLabel = (feature: string) => AI_FEATURE_LABEL[feature] ?? feature;

/** gemini-3.6-flash pricing (see Desktop 「Gemini API 收費分析.md」) — kept
 * here rather than duplicated at every call site; if the model constant in
 * GeminiContentAnalysisService ever changes, update this too. */
const INPUT_COST_PER_MILLION = 1.5;
const OUTPUT_COST_PER_MILLION = 7.5;

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION
  );
}

interface RecordParams {
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: AiUsageStatus;
  errorMessage?: string;
}

/** Per-user AI spend tracking — every logged-in user can only ever see
 * their own entries (see KnowledgeAiUsageController), this is personal
 * cost visibility, not a platform-wide admin report. */
@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordParams): Promise<void> {
    await this.prisma.aiUsageLog.create({
      data: {
        userId: params.userId,
        feature: params.feature,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costUsd: estimateCostUsd(params.inputTokens, params.outputTokens),
        durationMs: params.durationMs,
        status: params.status,
        errorMessage: params.errorMessage,
      },
    });
  }

  async history(userId: string) {
    // 台北的今天／本月（伺服器是 UTC，用本機時間會在台北 0～8 點算錯天）。
    const { todayStart, weekStart, monthStart } = taipeiUsageWindows();

    const [recentEntries, todayEntries, weekEntries, monthEntries] =
      await Promise.all([
        this.prisma.aiUsageLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.aiUsageLog.findMany({
          where: { userId, createdAt: { gte: todayStart } },
        }),
        this.prisma.aiUsageLog.findMany({
          where: { userId, createdAt: { gte: weekStart } },
        }),
        this.prisma.aiUsageLog.findMany({
          where: { userId, createdAt: { gte: monthStart } },
        }),
      ]);

    return {
      today: this.summarize(todayEntries),
      thisWeek: this.summarize(weekEntries),
      thisMonth: this.summarize(monthEntries),
      recentEntries,
    };
  }

  private summarize(
    entries: { inputTokens: number; outputTokens: number; costUsd: number }[],
  ) {
    return {
      count: entries.length,
      inputTokens: entries.reduce((sum, e) => sum + e.inputTokens, 0),
      outputTokens: entries.reduce((sum, e) => sum + e.outputTokens, 0),
      costUsd: entries.reduce((sum, e) => sum + e.costUsd, 0),
    };
  }
}
