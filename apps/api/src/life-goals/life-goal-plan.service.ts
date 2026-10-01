import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { FinancePlanService } from '../finance/finance-plan.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { taipeiDateKey } from '../common/taipei-date';
import { AiUsageStatus, LifeGoalStatus } from '../../generated/prisma/client.js';

const TRACKING_TYPES = ['MANUAL', 'CHECK_IN', 'NET_WORTH', 'NOTE_KEYWORD_SUM', 'ACCOUNT_BALANCE', 'STOCK_VALUE'] as const;
const PERIODS = ['TOTAL', 'WEEKLY', 'MONTHLY'] as const;

export interface GoalPlan {
  title: string;
  category: string | null;
  trackingType: (typeof TRACKING_TYPES)[number];
  targetValue: number | null;
  unit: string | null;
  targetDate: string | null;
  checkInPeriod: (typeof PERIODS)[number];
  requireCheckInNote: boolean;
  trackingAccountName: string | null;
  trackingKeyword: string | null;
  /** 做不做得到、為什麼（用他的真實數字）。 */
  feasibility: string;
  /** 存錢類：每月要存多少。 */
  monthlyNeeded: number | null;
  milestones: Array<{ date: string; text: string }>;
  weeklyActions: string[];
  tips: string | null;
}

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    category: { type: 'string' },
    trackingType: { type: 'string', enum: [...TRACKING_TYPES] },
    targetValue: { type: 'number' },
    unit: { type: 'string' },
    targetDate: { type: 'string' },
    checkInPeriod: { type: 'string', enum: [...PERIODS] },
    requireCheckInNote: { type: 'boolean' },
    trackingAccountName: { type: 'string' },
    trackingKeyword: { type: 'string' },
    feasibility: { type: 'string' },
    monthlyNeeded: { type: 'number' },
    milestones: {
      type: 'array',
      items: { type: 'object', properties: { date: { type: 'string' }, text: { type: 'string' } }, required: ['date', 'text'] },
    },
    weeklyActions: { type: 'array', items: { type: 'string' } },
    tips: { type: 'string' },
  },
  required: ['title', 'trackingType', 'checkInPeriod', 'feasibility', 'milestones', 'weeklyActions'],
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Exposed for tests: validate the model's JSON against what the goal form accepts. */
export function parseGoalPlan(raw: string, accountNames: string[]): GoalPlan {
  const d = JSON.parse(raw) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const trackingType = (TRACKING_TYPES as readonly string[]).includes(String(d.trackingType)) ? (d.trackingType as GoalPlan['trackingType']) : 'MANUAL';
  const account = str(d.trackingAccountName);
  return {
    title: str(d.title) ?? '',
    category: str(d.category),
    // 指定帳戶但帳戶不存在 → 改成手動，避免存不進去。
    trackingType: trackingType === 'ACCOUNT_BALANCE' && !(account && accountNames.includes(account)) ? 'MANUAL' : trackingType,
    targetValue: num(d.targetValue),
    unit: str(d.unit),
    targetDate: str(d.targetDate) && DATE.test(String(d.targetDate)) ? String(d.targetDate) : null,
    checkInPeriod: (PERIODS as readonly string[]).includes(String(d.checkInPeriod)) ? (d.checkInPeriod as GoalPlan['checkInPeriod']) : 'TOTAL',
    requireCheckInNote: d.requireCheckInNote === true,
    trackingAccountName: account && accountNames.includes(account) ? account : null,
    trackingKeyword: trackingType === 'NOTE_KEYWORD_SUM' ? str(d.trackingKeyword) : null,
    feasibility: str(d.feasibility) ?? '',
    monthlyNeeded: num(d.monthlyNeeded) != null ? Math.round(num(d.monthlyNeeded)!) : null,
    milestones: (Array.isArray(d.milestones) ? (d.milestones as Array<Record<string, unknown>>) : [])
      .map((m) => ({ date: String(m.date ?? ''), text: str(m.text) ?? '' }))
      .filter((m) => DATE.test(m.date) && m.text)
      .slice(0, 6),
    weeklyActions: (Array.isArray(d.weeklyActions) ? d.weeklyActions : []).map((a) => str(a)).filter((a): a is string => !!a).slice(0, 5),
    tips: str(d.tips),
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function goalPlanText(p: GoalPlan): string {
  return [
    `🎯 ${p.title}`,
    p.targetValue != null ? `目標：${fmt(p.targetValue)}${p.unit ?? ''}${p.targetDate ? `，${p.targetDate.replace(/-/g, '/')} 前` : ''}` : null,
    p.monthlyNeeded != null ? `每月要存：${fmt(p.monthlyNeeded)} 元` : null,
    '',
    p.feasibility,
    ...(p.milestones.length ? ['', '里程碑：', ...p.milestones.map((m) => `・${m.date.slice(5).replace('-', '/')} ${m.text}`)] : []),
    ...(p.weeklyActions.length ? ['', '每週可以做：', ...p.weeklyActions.map((a) => `・${a}`)] : []),
    ...(p.tips ? ['', p.tips] : []),
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** 人生目標規劃（2026-10-02）：使用者講想達成什麼，AI 幫他變成具體、可追蹤
 * 的目標——目標值、期限、追蹤方式、里程碑、每週行動；存錢目標用他真實的
 * 收支算每月要存多少、做不做得到。App 新增目標的「AI 幫我規劃」、LINE 都用這個。 */
@Injectable()
export class LifeGoalPlanService {
  private readonly logger = new Logger(LifeGoalPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly aiUsage: AiUsageService,
    private readonly financePlan: FinancePlanService,
  ) {}

  async plan(userId: string, input: { title: string; notes?: string | null }): Promise<GoalPlan> {
    const wish = input.title.trim();
    if (!wish) throw new BadRequestException('先寫想達成什麼');
    const user = await this.users.findById(userId);
    if (!user?.geminiApiKey) throw new BadRequestException('目標規劃需要 AI，請先到 App 左側「AI 設定」貼上你的 Gemini 金鑰');

    const [goals, finance, space] = await Promise.all([
      this.prisma.lifeGoal.findMany({
        where: { ownerUserId: userId, status: LifeGoalStatus.ACTIVE },
        select: { title: true, category: true, targetValue: true, unit: true, targetDate: true },
      }),
      this.financePlan.inputs(userId).catch(() => null),
      this.prisma.space.findUnique({ where: { ownerUserId: userId }, select: { financeAccounts: { select: { name: true } } } }),
    ]);
    const accountNames = space?.financeAccounts.map((a) => a.name) ?? [];
    const money = finance && {
      monthlyIncome: finance.fixedMonthlyIncome || finance.averageMonthlyIncome,
      averageMonthlyExpense: finance.averageMonthlyExpense,
      averageMonthlySurplus: (finance.fixedMonthlyIncome || finance.averageMonthlyIncome) - finance.averageMonthlyExpense,
      netWorth: finance.netWorth,
      wishlistMonthlyBudget: finance.wishlist.monthlyBudget,
    };

    const prompt = [
      '你是務實的人生教練，幫使用者把想達成的事變成具體、追蹤得到的目標。',
      `今天是 ${taipeiDateKey(new Date())}。`,
      `他想達成：${wish}`,
      input.notes?.trim() ? `補充：${input.notes.trim()}` : '',
      `他現在進行中的目標：${goals.length ? JSON.stringify(goals) : '（沒有）'}`,
      money ? `他的財務（新台幣，近 3 個月）：${JSON.stringify(money)}` : '還沒有記帳資料。',
      `他的記帳帳戶：${accountNames.join('、') || '（沒有）'}`,
      '',
      '回傳 JSON，繁體中文、簡短、講具體數字：',
      '- title：具體的目標名稱（例如「年底前存到 50 萬」「一年讀 12 本書」）。',
      '- category：2～4 字的分類。',
      '- trackingType：怎麼追蹤——存錢看總資產用 NET_WORTH、存在某個帳戶用 ACCOUNT_BALANCE（trackingAccountName 填帳戶名，一定要是上面的帳戶）、讀書/運動這種一次一次做的用 CHECK_IN、體重這種數字用 MANUAL、股票市值用 STOCK_VALUE。',
      '- targetValue＋unit：目標數字和單位（元、本、次、公斤…）；CHECK_IN 是總共或每期要做幾次。',
      '- targetDate：YYYY-MM-DD，他沒講就訂一個合理的期限。',
      '- checkInPeriod：CHECK_IN 每週/每月重新算就 WEEKLY/MONTHLY，累計就 TOTAL。讀書類 requireCheckInNote=true。',
      '- feasibility：2～3 句，用他的真實數字說做不做得到；存錢類算每月要存多少、跟他的平均結餘比；太難就建議調整期限或數字。',
      '- monthlyNeeded：存錢類每月要存多少元（其他不填）。',
      '- milestones：3～5 個里程碑（date＋text），從現在到期限平均分。',
      '- weeklyActions：2～4 個每週具體可以做的小行動。',
      '- tips：一句提醒（可不填）。',
    ]
      .filter((l) => l !== '')
      .join('\n');

    const startedAt = Date.now();
    try {
      const client = new GoogleGenAI({ apiKey: user.geminiApiKey });
      const interaction = await client.interactions.create({
        model: GEMINI_MODEL,
        input: prompt,
        response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
      });
      await this.aiUsage.record({
        userId,
        feature: 'life_goal_plan',
        model: GEMINI_MODEL,
        inputTokens: interaction.usage?.total_input_tokens ?? 0,
        outputTokens: interaction.usage?.total_output_tokens ?? 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });
      const raw = interaction.output_text?.trim();
      if (!raw) throw new Error('AI 沒有回應');
      const plan = parseGoalPlan(raw, accountNames);
      if (!plan.title) plan.title = wish;
      return plan;
    } catch (error) {
      await this.aiUsage.record({
        userId,
        feature: 'life_goal_plan',
        model: GEMINI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(`目標規劃失敗（userId=${userId}）：${String(error)}`);
      throw new BadRequestException('目標規劃產生失敗，請稍後再試一次');
    }
  }
}
