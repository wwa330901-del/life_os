import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';
import { taipeiDateKeyToUtcMidnight, taipeiTodayRange } from '../common/taipei-date';
import { summarizeFeatureUsage } from './ai-feature-usage';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 功能使用次數看近幾天（太短會把一個月才用一次的功能誤判成沒在用）。 */
export const FEATURE_USAGE_DAYS = 90;
/** AiToolCall 從這天開始記（之前的對話不知道用了哪些功能）。 */
export const FEATURE_USAGE_SINCE = '2026-10-13';

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
  line_ai_chat: 'LINE 閒聊（輕量）',
  app_ai_chat: 'App 閒聊（輕量）',
  ai_assistant_line: 'LINE 查詢',
  divination: '算命解卦',
  finance_plan: '理財評估',
  life_goal_category: '目標分類',
  life_goal_plan: '目標規劃',
  life_review: '週/月回顧總結',
  trip_plan: '旅行規劃',
  receipt: '收據辨識',
  voice: '語音轉文字',
};

export const featureLabel = (feature: string) => AI_FEATURE_LABEL[feature] ?? feature;

/** 哪一家的 AI（AI 用量分開看，2026-10-02 起 Claude 為主、Gemini 只剩語音和影片）。 */
export const AI_PROVIDERS = ['Claude', 'Gemini'] as const;
export const aiProvider = (model: string): (typeof AI_PROVIDERS)[number] => (model.startsWith('gemini') ? 'Gemini' : 'Claude');

/** 每百萬 token 美元（輸入、輸出、寫快取 5 分鐘、讀快取）。Claude 照官方價；Gemini
 * 照 3.6 Flash 付費價估（免費額度內實際 0 元，這是上限）。沒列到的模型用 Sonnet 的價。 */
const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  gemini: { input: 1.5, output: 7.5, cacheWrite: 1.5, cacheRead: 1.5 },
};

/** inputTokens 是全部輸入（含快取讀寫的部分）。 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  /** cacheWriteTokens 裡寫 1 小時快取的部分（輸入價 2 倍）。 */
  cacheWrite1hTokens = 0,
): number {
  const p = PRICES[model] ?? (model.startsWith('gemini') ? PRICES.gemini : PRICES['claude-sonnet-5-5']);
  const plain = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const write5m = Math.max(0, cacheWriteTokens - cacheWrite1hTokens);
  return (
    (plain * p.input + cacheReadTokens * p.cacheRead + write5m * p.cacheWrite + cacheWrite1hTokens * p.input * 2 + outputTokens * p.output) / 1_000_000
  );
}

/** 近 [days] 天每個 AI 功能用了幾次（userId 給 null＝所有使用者，管理員看的）。 */
export async function queryFeatureUsage(prisma: PrismaService, userId: string | null, days = FEATURE_USAGE_DAYS) {
  const since = new Date(Date.now() - days * DAY_MS);
  const where = { createdAt: { gte: since }, ...(userId && { userId }) };
  const [tools, logs] = await Promise.all([
    prisma.aiToolCall.groupBy({ by: ['tool'], where, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.aiUsageLog.groupBy({ by: ['feature'], where, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  return {
    days,
    /** 開始記錄還沒滿 [days] 天：「沒用過」可能只是還沒記到。 */
    collecting: since < new Date(`${FEATURE_USAGE_SINCE}T00:00:00+08:00`),
    ...summarizeFeatureUsage(
      tools.map((t) => ({ tool: t.tool, count: t._count._all, lastUsedAt: t._max.createdAt })),
      logs.map((l) => ({ feature: l.feature, count: l._count._all, lastUsedAt: l._max.createdAt })),
    ),
  };
}

/** LINE「AI 用量」用的幾行：用最多的功能＋近 N 天沒用過的功能。 */
export function featureUsageLines(usage: Awaited<ReturnType<typeof queryFeatureUsage>>): string[] {
  const used = usage.features.filter((f) => f.count > 0);
  return [
    '',
    `近 ${usage.days} 天各功能用了幾次：`,
    ...(used.length ? used.slice(0, 8).map((f) => `・${f.feature} ${f.count} 次`) : ['・還沒有紀錄（2026-10-13 起開始記）']),
    ...(usage.unused.length ? ['', `近 ${usage.days} 天沒用過：${usage.unused.join('、')}`] : []),
    ...(usage.collecting ? [`（對話裡的功能從 ${FEATURE_USAGE_SINCE} 才開始記，滿 ${usage.days} 天後比較準）`] : []),
  ];
}

interface RecordParams {
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Claude 的快取讀/寫（算錢用，讀快取便宜很多）。 */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cacheWrite1hTokens?: number;
  durationMs: number;
  status: AiUsageStatus;
  errorMessage?: string;
}

/** Per-user AI spend tracking — every logged-in user can only ever see
 * their own entries (see KnowledgeAiUsageController), this is personal
 * cost visibility, not a platform-wide admin report. */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordParams): Promise<void> {
    await this.prisma.aiUsageLog.create({
      data: {
        userId: params.userId,
        feature: params.feature,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costUsd: estimateCostUsd(params.model, params.inputTokens, params.outputTokens, params.cacheReadTokens, params.cacheWriteTokens, params.cacheWrite1hTokens),
        durationMs: params.durationMs,
        status: params.status,
        errorMessage: params.errorMessage,
      },
    });
  }

  /** AI 在對話裡呼叫了一次工具（AI 功能使用次數）。記錄失敗不影響對話。 */
  async recordToolCall(userId: string, tool: string, success: boolean): Promise<void> {
    try {
      await this.prisma.aiToolCall.create({ data: { userId, tool, success } });
    } catch (error) {
      this.logger.warn(`AI 功能使用次數記錄失敗：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  featureUsage(userId: string) {
    return queryFeatureUsage(this.prisma, userId);
  }

  async history(userId: string) {
    // 台北的今天／本月（伺服器是 UTC，用本機時間會在台北 0～8 點算錯天）。
    const { todayStart, weekStart, monthStart } = taipeiUsageWindows();

    const [recentEntries, todayEntries, weekEntries, monthEntries, featureUsage] =
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
        this.featureUsage(userId),
      ]);

    return {
      today: this.summarize(todayEntries),
      thisWeek: this.summarize(weekEntries),
      thisMonth: this.summarize(monthEntries),
      recentEntries,
      featureUsage,
    };
  }

  private summarize(entries: { model: string; inputTokens: number; outputTokens: number; costUsd: number }[]) {
    const total = (list: typeof entries) => ({
      count: list.length,
      inputTokens: list.reduce((sum, e) => sum + e.inputTokens, 0),
      outputTokens: list.reduce((sum, e) => sum + e.outputTokens, 0),
      costUsd: list.reduce((sum, e) => sum + e.costUsd, 0),
    });
    return {
      ...total(entries),
      byProvider: AI_PROVIDERS.map((provider) => ({ provider, ...total(entries.filter((e) => aiProvider(e.model) === provider)) })),
    };
  }
}
