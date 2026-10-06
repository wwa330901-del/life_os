/** 財務規劃（2026-10-02）：AI 回傳的結構化結果——每月分配、建議預算、接下來
 * 幾步、購物車建議。App「規劃」分頁畫成卡片、LINE 轉成文字，預算可以一鍵套用。 */

export interface PlanAllocation {
  name: string;
  amount: number;
  percent: number;
  reason: string;
}

export interface PlanBudget {
  category: string;
  amount: number;
  /** 近 3 個月平均（系統補上，不是 AI 填的）。 */
  currentAverage: number | null;
  reason: string;
}

/** 每個目標怎麼存（2026-10-07）。 */
export interface PlanGoal {
  name: string;
  amount: number;
  monthlySaving: number;
  /** 照這樣存大概哪個月達成（YYYY-MM）。 */
  eta: string | null;
  onTrack: boolean;
  advice: string;
}

export interface FinancePlanResult {
  summary: string;
  monthlyIncome: number;
  allocation: PlanAllocation[];
  budgets: PlanBudget[];
  steps: string[];
  wishlistAdvice: string | null;
  goals: PlanGoal[];
  generatedAt: string;
}

export const FINANCE_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    allocation: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, amount: { type: 'number' }, percent: { type: 'number' }, reason: { type: 'string' } },
        required: ['name', 'amount', 'percent', 'reason'],
      },
    },
    budgets: {
      type: 'array',
      items: {
        type: 'object',
        properties: { category: { type: 'string' }, amount: { type: 'number' }, reason: { type: 'string' } },
        required: ['category', 'amount', 'reason'],
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    wishlistAdvice: { type: 'string' },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'number' },
          monthlySaving: { type: 'number' },
          eta: { type: 'string' },
          onTrack: { type: 'boolean' },
          advice: { type: 'string' },
        },
        required: ['name', 'amount', 'monthlySaving', 'eta', 'onTrack', 'advice'],
      },
    },
  },
  required: ['summary', 'allocation', 'budgets', 'steps'],
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));

/** 驗證 AI 的 JSON：只留可以設預算的分類、金額要是正數；補上現在的平均。 */
export function parseFinancePlan(
  raw: string,
  ctx: { monthlyIncome: number; budgetableCategories: string[]; categoryAverages: Array<{ name: string; monthlyAverage: number }> },
  now = new Date(),
): FinancePlanResult {
  const data = JSON.parse(raw) as Record<string, unknown>;
  const allowed = new Set(ctx.budgetableCategories);
  const avg = new Map(ctx.categoryAverages.map((c) => [c.name, c.monthlyAverage]));
  const list = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);
  const seen = new Set<string>();
  return {
    summary: str(data.summary),
    monthlyIncome: Math.round(ctx.monthlyIncome),
    allocation: list(data.allocation)
      .map((a) => ({ name: str(a.name), amount: Math.round(num(a.amount)), percent: Math.round(num(a.percent)), reason: str(a.reason) }))
      .filter((a) => a.name && a.amount > 0),
    budgets: list(data.budgets)
      .map((b) => ({ category: str(b.category), amount: Math.round(num(b.amount) / 100) * 100, reason: str(b.reason) }))
      .filter((b) => allowed.has(b.category) && b.amount > 0 && !seen.has(b.category) && seen.add(b.category))
      .map((b) => ({ ...b, currentAverage: avg.get(b.category) ?? null })),
    steps: (Array.isArray(data.steps) ? data.steps : []).map(str).filter(Boolean).slice(0, 5),
    wishlistAdvice: str(data.wishlistAdvice) || null,
    goals: list(data.goals)
      .map((g) => ({
        name: str(g.name),
        amount: Math.round(num(g.amount)),
        monthlySaving: Math.round(num(g.monthlySaving)),
        eta: /^\d{4}-\d{2}$/.test(str(g.eta)) ? str(g.eta) : null,
        onTrack: g.onTrack === true,
        advice: str(g.advice),
      }))
      .filter((g) => g.name && g.amount > 0),
    generatedAt: now.toISOString(),
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function financePlanText(p: FinancePlanResult): string {
  return [
    '【現況】',
    p.summary,
    '',
    `【每月分配】（月收入 ${fmt(p.monthlyIncome)}）`,
    ...p.allocation.map((a) => `・${a.name} ${fmt(a.amount)}（${a.percent}%）${a.reason ? `：${a.reason}` : ''}`),
    ...(p.budgets.length
      ? [
          '',
          '【建議預算】',
          ...p.budgets.map((b) => `・${b.category} ${fmt(b.amount)}${b.currentAverage != null ? `（現在平均 ${fmt(b.currentAverage)}）` : ''}`),
        ]
      : []),
    ...(p.goals?.length
      ? [
          '',
          '【目標怎麼存】',
          ...p.goals.map(
            (g) =>
              `・${g.name} ${fmt(g.amount)}：每月存 ${fmt(g.monthlySaving)}${g.eta ? `，大約 ${g.eta.replace('-', ' 年 ')} 月達成` : ''}${g.onTrack ? '' : '（照原本的時間來不及）'}${g.advice ? `。${g.advice}` : ''}`,
          ),
        ]
      : []),
    ...(p.wishlistAdvice ? ['', '【購物車】', p.wishlistAdvice] : []),
    '',
    '【接下來】',
    ...p.steps.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');
}
