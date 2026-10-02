import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceTransactionsService } from './finance-transactions.service';
import { FinanceReportService } from './finance-report.service';
import { taipeiCurrentMonth } from '../common/taipei-date';
import { shiftMonth } from './wishlist';
import {
  ageFromBirthDate,
  DEFAULT_RETIREMENT_SETTINGS,
  parseRetirementSettings,
  projectRetirement,
  RetirementProjection,
  RetirementSettings,
  validateRetirementPatch,
} from './retirement';
import type { Prisma } from '../../generated/prisma/client.js';

export type RetirementOverrides = Partial<Pick<RetirementSettings, 'retireAge' | 'monthlySaving' | 'monthlyExpense' | 'returnRate' | 'pensionMonthly' | 'pensionStartAge'>>;

export interface RetirementReport {
  /** 沒有生日也沒填年齡 → 先問。 */
  needsAge: boolean;
  /** 沒有記帳資料也沒填退休後花費 → 算不出要多少，先問。 */
  needsExpense: boolean;
  settings: RetirementSettings;
  /** 自動抓的數字（App 顯示「自動：近 6 個月平均」）。 */
  auto: { monthlySaving: number; monthlyExpense: number; assets: number; age: number | null };
  projection: RetirementProjection | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const wan = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(Math.abs(n) >= 1_000_000 ? 0 : 1)} 萬` : fmt(n));

/** 退休試算：資產＝淨資產（含股票），每月存多少／花多少＝近 6 個月平均，年齡＝生日。 */
@Injectable()
export class RetirementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: FinanceTransactionsService,
    private readonly report: FinanceReportService,
  ) {}

  private async spaceOf(userId: string) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId }, select: { id: true, retirementSettings: true } });
    if (!space) throw new BadRequestException('找不到個人空間，請先登入 App 一次');
    return space;
  }

  /** overrides：AI 試算「如果 60 歲退休」「每月多存 5000」用，不會存起來。 */
  async forUser(userId: string, overrides: RetirementOverrides = {}): Promise<RetirementReport> {
    const space = await this.spaceOf(userId);
    const month = taipeiCurrentMonth();
    const [user, netWorth, summaries] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } }),
      this.report.computeNetWorth(userId, space.id),
      Promise.all([1, 2, 3, 4, 5, 6].map((n) => this.transactions.monthlySummary(userId, space.id, shiftMonth(month, -n)))),
    ]);
    // 還沒記帳的月份不算進平均（新使用者只記了 2 個月就用 2 個月平均）。
    const recorded = summaries.filter((s) => s.totalIncome > 0 || s.totalExpense > 0);
    const n = Math.max(1, recorded.length);
    const avgIncome = recorded.reduce((s, x) => s + x.totalIncome, 0) / n;
    const avgExpense = recorded.reduce((s, x) => s + x.totalExpense, 0) / n;

    const settings = { ...parseRetirementSettings(space.retirementSettings), ...validateOverrides(overrides) };
    const age = user?.birthDate ? ageFromBirthDate(user.birthDate, new Date()) : settings.age;
    const auto = {
      monthlySaving: Math.round(avgIncome - avgExpense),
      monthlyExpense: Math.round(avgExpense),
      assets: Math.round(netWorth.netWorth),
      age: age == null ? null : Math.floor(age),
    };
    const needsExpense = (settings.monthlyExpense ?? auto.monthlyExpense) <= 0;
    if (age == null) return { needsAge: true, needsExpense, settings, auto, projection: null };
    const projection = projectRetirement({
      age,
      assets: netWorth.netWorth,
      monthlySaving: settings.monthlySaving ?? auto.monthlySaving,
      monthlyExpense: settings.monthlyExpense ?? auto.monthlyExpense,
      settings,
    });
    return { needsAge: false, needsExpense, settings, auto, projection };
  }

  async updateSettings(userId: string, patch: Partial<Record<keyof RetirementSettings, number | null>>): Promise<RetirementReport> {
    const space = await this.spaceOf(userId);
    let valid: Partial<RetirementSettings>;
    try {
      valid = validateRetirementPatch(patch);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const merged = { ...parseRetirementSettings(space.retirementSettings), ...valid };
    if (merged.lifeExpectancy <= merged.retireAge) {
      // 只調退休年齡卻超過了「預計活到幾歲」：自動把活到幾歲往後推，不要擋（2026-10-02 使用者回報）。
      if (valid.lifeExpectancy !== undefined) throw new BadRequestException('「預計活到幾歲」要比退休年齡大');
      merged.lifeExpectancy = Math.min(120, Math.max(DEFAULT_RETIREMENT_SETTINGS.lifeExpectancy, merged.retireAge + 20));
    }
    await this.prisma.space.update({ where: { id: space.id }, data: { retirementSettings: merged as unknown as Prisma.InputJsonValue } });
    return this.forUser(userId);
  }

  /** LINE「退休試算」。 */
  async text(userId: string): Promise<string> {
    const r = await this.forUser(userId);
    if (!r.projection) {
      return '🧓 退休試算\n\n我還不知道你幾歲～直接跟我說生日（例如「我 1995/3/2 生」）或「我 30 歲」，我就幫你算。';
    }
    if (r.needsExpense) {
      return '🧓 退休試算\n\n還沒有記帳資料，算不出你退休後要花多少～跟我說「退休後每月大概花 3 萬」，或先記幾個月的帳，我就幫你算。';
    }
    const p = r.projection;
    const lines = [
      '🧓 退休試算（用今天的幣值算）',
      '',
      `現在 ${Math.floor(p.age)} 歲，想 ${p.retireAge} 歲退休、錢要夠用到 ${r.settings.lifeExpectancy} 歲`,
      `淨資產 ${wan(p.assets)}、每月存 ${fmt(p.monthlySaving)}、退休後每月花 ${fmt(p.monthlyExpense)}${p.pensionMonthly ? `（${r.settings.pensionStartAge} 歲起退休金每月 ${fmt(p.pensionMonthly)}）` : ''}`,
      '',
      `${p.retireAge} 歲時會有 ${wan(p.assetsAtRetire)}，需要 ${wan(p.needAtRetire)}`,
      p.onTrack ? (p.gap < 0 ? `✅ 夠了，還多 ${wan(-p.gap)}` : '✅ 剛好夠') : `⚠️ 還差 ${wan(p.gap)}，每月要存 ${fmt(p.requiredMonthlySaving)} 才夠`,
      p.earliestAge != null ? `照現在的存法，最早 ${p.earliestAge} 歲可以退休` : '照現在的存法，到老都還不夠',
    ];
    if (!p.onTrack && p.depletionAge != null) lines.push(`${p.retireAge} 歲退休的話，錢大概 ${p.depletionAge} 歲用完`);
    const better = p.scenarios.filter((s) => s.earliestAge != null && (p.earliestAge == null || s.earliestAge < p.earliestAge));
    if (better.length) lines.push('', '每月多存一點：', ...better.map((s) => `・多存 ${fmt(s.extraMonthly)} → ${s.earliestAge} 歲`));
    lines.push('', `假設年報酬 ${r.settings.returnRate}%、通膨 ${r.settings.inflation}%。想改退休年齡、退休金、報酬率直接跟我說，或在 App 財務「退休」調整。`);
    return lines.join('\n');
  }
}

function validateOverrides(o: RetirementOverrides): Partial<RetirementSettings> {
  const cleaned = Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)));
  try {
    return validateRetirementPatch(cleaned);
  } catch (error) {
    throw new BadRequestException((error as Error).message);
  }
}
