import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';

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
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

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
