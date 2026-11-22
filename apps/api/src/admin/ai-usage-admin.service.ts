import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { AI_PROVIDERS, aiProvider, featureLabel, featureUsageLines, queryFeatureUsage, taipeiUsageWindows } from '../knowledge/ai-usage.service';
import { AiUsageStatus } from '../../generated/prisma/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 14;
/** 一天失敗幾次以上就通知管理員。 */
const ALERT_FAILURES = 5;
/** 今天花費超過「近 7 天平均的幾倍」而且超過這個金額（美金）就通知。 */
const ALERT_COST_MULTIPLIER = 2;
const ALERT_COST_MIN_USD = 0.5;
/** 每月 AI 費用（Claude＋Gemini 合計，系統自己估的）到這兩個金額各通知一次（2026-11-22 使用者定的）；AI 不會停。 */
export const AI_COST_NOTICE_USD = 20;
export const AI_COST_SEVERE_USD = 30;

/** 本月費用跨過哪些門檻（大的在前）。 */
export const crossedCostLevels = (monthUsd: number) => [AI_COST_SEVERE_USD, AI_COST_NOTICE_USD].filter((t) => monthUsd >= t);

/** 費用警告的 LINE 文字。 */
export function costAlertText(
  level: number,
  month: { costUsd: number },
  providers: { provider: string; costUsd: number }[],
  features: { label: string; costUsd: number }[],
): string {
  const severe = level >= AI_COST_SEVERE_USD;
  return [
    severe ? `🚨 AI 費用嚴重警告（只有你收到）` : `💰 AI 費用通知（只有你收到）`,
    `本月 AI 已經花了約 ${usd(month.costUsd)}，${severe ? '超過' : '到了'} ${level} 美金`,
    `（${providers.map((p) => `${p.provider} ${usd(p.costUsd)}`).join('、')}）`,
    ...(features.length ? ['', '花最多的功能：', ...features.slice(0, 3).map((f) => `・${f.label} ${usd(f.costUsd)}`)] : []),
    '',
    severe ? 'AI 還是會繼續用，不會停。想省錢可以少用花最多的功能。' : `到 ${AI_COST_SEVERE_USD} 美金會再發一次嚴重警告。AI 不會停。`,
    '傳「AI 用量」看完整數字。（金額是依 token 估的，實際以帳單為準）',
  ].join('\n');
}

interface Row {
  userId: string;
  feature: string;
  model: string;
  costUsd: number;
  status: AiUsageStatus;
  createdAt: Date;
}

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

function sum(rows: Row[]) {
  return {
    count: rows.length,
    costUsd: rows.reduce((s, r) => s + r.costUsd, 0),
    failures: rows.filter((r) => r.status === AiUsageStatus.FAILED).length,
  };
}

/** Taipei calendar day 'YYYY-MM-DD' of an instant. */
const dayKey = (d: Date) => new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** AI 用量（管理員專用，2026-10-02）：所有使用者的用量總覽、每晚異常通知
 * ——跟軟體有關的通知只發給管理員本人。 */
@Injectable()
export class AiUsageAdminService {
  private readonly logger = new Logger(AiUsageAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: LineNotifierService,
  ) {}

  async overview() {
    const { todayStart, weekStart, monthStart } = taipeiUsageWindows();
    const trendStart = new Date(todayStart.getTime() - (TREND_DAYS - 1) * DAY_MS);
    const since = trendStart < monthStart ? trendStart : monthStart;
    const [rows, users, recentFailures, featureUsage] = await Promise.all([
      this.prisma.aiUsageLog.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true, feature: true, model: true, costUsd: true, status: true, createdAt: true },
      }),
      this.prisma.user.findMany({ select: { id: true, name: true, email: true } }),
      this.prisma.aiUsageLog.findMany({
        where: { status: AiUsageStatus.FAILED },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { createdAt: true, userId: true, feature: true, errorMessage: true },
      }),
      queryFeatureUsage(this.prisma, null),
    ]);
    const nameOf = new Map(users.map((u) => [u.id, u.name || u.email]));
    const month = rows.filter((r) => r.createdAt >= monthStart);

    const byUser = new Map<string, Row[]>();
    const byFeature = new Map<string, Row[]>();
    for (const r of month) {
      byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
      byFeature.set(r.feature, [...(byFeature.get(r.feature) ?? []), r]);
    }

    const daily = Array.from({ length: TREND_DAYS }, (_, i) => {
      const start = new Date(trendStart.getTime() + i * DAY_MS);
      const end = new Date(start.getTime() + DAY_MS);
      return { date: dayKey(start), ...sum(rows.filter((r) => r.createdAt >= start && r.createdAt < end)) };
    });

    return {
      today: sum(rows.filter((r) => r.createdAt >= todayStart)),
      thisWeek: sum(rows.filter((r) => r.createdAt >= weekStart)),
      thisMonth: sum(month),
      users: [...byUser.entries()]
        .map(([userId, list]) => ({
          userId,
          name: nameOf.get(userId) ?? '（已刪除）',
          ...sum(list),
          lastUsedAt: list.reduce((a, r) => (r.createdAt > a ? r.createdAt : a), list[0].createdAt),
        }))
        .sort((a, b) => b.costUsd - a.costUsd),
      /** 本月各家 AI（Claude／Gemini 分開）。 */
      providers: AI_PROVIDERS.map((provider) => ({ provider, ...sum(month.filter((r) => aiProvider(r.model) === provider)) })),
      features: [...byFeature.entries()]
        .map(([feature, list]) => ({ feature, label: featureLabel(feature), ...sum(list) }))
        .sort((a, b) => b.costUsd - a.costUsd),
      daily,
      /** 近 90 天所有使用者各 AI 功能用了幾次（哪些功能沒人用、可以拿掉）。 */
      featureUsage,
      recentFailures: recentFailures.map((f) => ({
        at: f.createdAt,
        user: nameOf.get(f.userId) ?? '（已刪除）',
        feature: featureLabel(f.feature),
        error: f.errorMessage?.slice(0, 200) ?? null,
      })),
    };
  }

  /** LINE「AI 用量」（管理員）。 */
  async summaryText(): Promise<string> {
    const o = await this.overview();
    const line = (label: string, s: { count: number; costUsd: number; failures: number }) =>
      `${label}：${s.count} 次、${usd(s.costUsd)}${s.failures ? `（失敗 ${s.failures}）` : ''}`;
    return [
      '🤖 AI 用量（所有使用者）',
      line('今天', o.today),
      line('近 7 天', o.thisWeek),
      line('本月', o.thisMonth),
      `（本月到 ${AI_COST_NOTICE_USD} 美金會 LINE 通知你，到 ${AI_COST_SEVERE_USD} 美金發嚴重警告）`,
      '',
      '本月各 AI：',
      ...o.providers.map((p) => `・${p.provider} ${p.count} 次 ${usd(p.costUsd)}${p.failures ? `（失敗 ${p.failures}）` : ''}`),
      ...(o.features.length ? ['', '本月各功能：', ...o.features.slice(0, 6).map((f) => `・${f.label} ${f.count} 次 ${usd(f.costUsd)}`)] : []),
      ...(o.users.length > 1 ? ['', '本月各使用者：', ...o.users.slice(0, 6).map((u) => `・${u.name} ${u.count} 次 ${usd(u.costUsd)}`)] : []),
      ...featureUsageLines(o.featureUsage),
      '',
      '詳細在 App「管理」→「AI 用量」。（金額是依 token 估的，實際以 Anthropic／Google 帳單為準）',
    ].join('\n');
  }

  /** 每晚 21:00：今天失敗太多或花費暴增才通知管理員；平常不吵。 */
  @Cron('0 21 * * *', { timeZone: 'Asia/Taipei' })
  async alertAdmins(): Promise<void> {
    try {
      const text = await this.alertText();
      if (!text) return;
      const admins = await this.prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { id: true } });
      for (const a of admins) await this.notifier.notifyByUser(a.id, text);
    } catch (error) {
      this.logger.error('AI 用量通知失敗', error);
    }
  }

  /** 每小時看一次本月 AI 費用，跨過 20／30 美金各發一次（同一個月不重發；一次跨兩個只發嚴重的）。 */
  @Cron('5 * * * *', { timeZone: 'Asia/Taipei' })
  async checkMonthlyCost(): Promise<void> {
    try {
      const text = await this.monthlyCostAlert();
      if (!text) return;
      const admins = await this.prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { id: true } });
      for (const a of admins) await this.notifier.notifyByUser(a.id, text);
    } catch (error) {
      this.logger.error('AI 費用警告失敗', error);
    }
  }

  /** 要發的費用警告；已經發過或還沒到就 null。發之前先記下來，避免兩台同時發。 */
  async monthlyCostAlert(): Promise<string | null> {
    const { monthStart } = taipeiUsageWindows();
    const month = await this.prisma.aiUsageLog.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { userId: true, feature: true, model: true, costUsd: true, status: true, createdAt: true },
    });
    const total = sum(month);
    const levels = crossedCostLevels(total.costUsd);
    if (levels.length === 0) return null;
    const monthKey = dayKey(monthStart).slice(0, 7);
    let send: number | null = null;
    for (const level of levels) {
      const created = await this.prisma.systemAlertLog.createMany({ data: [{ key: `ai-cost:${level}:${monthKey}` }], skipDuplicates: true });
      if (created.count > 0 && send === null) send = level;
    }
    // 大的門檻已經發過，小的就算剛補記也不用再發。
    if (send === null || send !== levels[0]) return null;
    const byFeature = new Map<string, number>();
    for (const r of month) byFeature.set(r.feature, (byFeature.get(r.feature) ?? 0) + r.costUsd);
    return costAlertText(
      send,
      total,
      AI_PROVIDERS.map((provider) => ({ provider, costUsd: sum(month.filter((r) => aiProvider(r.model) === provider)).costUsd })),
      [...byFeature.entries()].map(([f, costUsd]) => ({ label: featureLabel(f), costUsd })).sort((a, b) => b.costUsd - a.costUsd),
    );
  }

  async alertText(): Promise<string | null> {
    const o = await this.overview();
    const prev7 = o.daily.slice(-8, -1);
    const avg = prev7.reduce((s, d) => s + d.costUsd, 0) / Math.max(1, prev7.length);
    const tooManyFailures = o.today.failures >= ALERT_FAILURES;
    const costSpike = o.today.costUsd >= ALERT_COST_MIN_USD && o.today.costUsd > avg * ALERT_COST_MULTIPLIER;
    if (!tooManyFailures && !costSpike) return null;
    const todayFailures = o.recentFailures.filter((f) => dayKey(new Date(f.at)) === o.daily[o.daily.length - 1].date);
    return [
      '🤖 AI 用量提醒（只有你收到）',
      costSpike ? `今天花了 ${usd(o.today.costUsd)}，是近 7 天平均（${usd(avg)}）的 ${(o.today.costUsd / Math.max(avg, 0.0001)).toFixed(1)} 倍` : null,
      tooManyFailures ? `今天 AI 失敗 ${o.today.failures} 次` : null,
      ...(todayFailures.length
        ? ['', '最近的失敗：', ...todayFailures.slice(0, 3).map((f) => `・${f.user}／${f.feature}：${f.error ?? '（沒有訊息）'}`.slice(0, 160))]
        : []),
      '',
      '傳「AI 用量」看完整數字。',
    ]
      .filter((l) => l !== null)
      .join('\n');
  }
}
