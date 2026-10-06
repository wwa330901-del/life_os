/** 財務規劃前先問使用者的（2026-10-07 使用者要求「應該先問過我有什麼支出或想法」，
 * 同一天擴充成七大類：收入、每月固定支出、年度支出、生活費、家底、目標、想法偏好）。
 * 存在 Space.financePlanProfile，下次規劃直接帶出來讓他確認，只改有變的。 */

export type IncomeStability = 'stable' | 'variable' | 'changing';
export type RiskProfile = 'conservative' | 'balanced' | 'aggressive' | 'none';
export type GoalTerm = 'short' | 'mid' | 'long';

/** 優先順序的選項（App 讓他排先後）。 */
export const PLAN_PRIORITIES = {
  debt: '還債',
  emergency: '存緊急預備金',
  goals: '存目標',
  invest: '投資',
  lifestyle: '生活品質',
} as const;
export type PlanPriority = keyof typeof PLAN_PRIORITIES;

export const RISK_LABEL: Record<RiskProfile, string> = {
  conservative: '保守（不想虧錢）',
  balanced: '穩健（可以接受小波動）',
  aggressive: '積極（追求長期報酬）',
  none: '先不投資',
};
export const STABILITY_LABEL: Record<IncomeStability, string> = {
  stable: '穩定',
  variable: '每月會變動',
  changing: '接下來可能有變化',
};

export interface FinancePlanProfile {
  // 一、收入
  /** 每月實拿薪水（null＝沒講，用固定薪資或記帳平均）。 */
  monthlyIncome: number | null;
  payDay: number | null;
  /** 其他收入（年終、獎金、兼職、租金、股利…），金額是「一年大概多少」。 */
  otherIncome: Array<{ name: string; annualAmount: number }>;
  incomeStability: IncomeStability | null;
  incomeChangeNote: string | null;
  // 二、每月固定支出
  fixedExpenses: Array<{ name: string; amount: number }>;
  // 三、一年才付一次的大筆支出
  annualExpenses: Array<{ name: string; amount: number; month: number | null }>;
  // 四、生活費（餐飲、購物、娛樂每月大概多少）
  livingExpense: number | null;
  // 五、家底
  /** 緊急預備金想留幾個月的生活費。 */
  emergencyMonths: number | null;
  /** 股票以外的投資或資產（基金、儲蓄險…），自由文字。 */
  otherAssets: string | null;
  // 六、目標
  goals: Array<{ name: string; amount: number; targetMonth: string | null; term: GoalTerm }>;
  // 七、想法偏好
  /** 每月想存多少（金額）。 */
  savingTarget: number | null;
  /** 或是收入的幾 %。 */
  savingRate: number | null;
  priorities: PlanPriority[];
  riskProfile: RiskProfile | null;
  cutBack: string | null;
  thoughts: string | null;
  updatedAt: string;
}

/** 前端/AI 送來的（每個欄位都可以不帶＝保留上次；帶 null＝清掉）。 */
export type FinancePlanProfileInput = { [K in keyof Omit<FinancePlanProfile, 'updatedAt'>]?: unknown };

const MAX_ITEMS = 30;
const text = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const money = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const intIn = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | null =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : null;
const list = (v: unknown) =>
  (Array.isArray(v) ? v : []).map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>) : {})).slice(0, MAX_ITEMS);

const CLEAN: { [K in keyof Omit<FinancePlanProfile, 'updatedAt'>]: (v: unknown) => FinancePlanProfile[K] } = {
  monthlyIncome: money,
  payDay: (v) => intIn(v, 1, 31),
  otherIncome: (v) =>
    list(v)
      .map((e) => ({ name: text(e.name, 40) ?? '', annualAmount: money(e.annualAmount) ?? 0 }))
      .filter((e) => e.name && e.annualAmount > 0),
  incomeStability: (v) => oneOf(v, ['stable', 'variable', 'changing'] as const),
  incomeChangeNote: (v) => text(v, 500),
  fixedExpenses: (v) =>
    list(v)
      .map((e) => ({ name: text(e.name, 40) ?? '', amount: money(e.amount) ?? 0 }))
      .filter((e) => e.name && e.amount > 0),
  annualExpenses: (v) =>
    list(v)
      .map((e) => ({ name: text(e.name, 40) ?? '', amount: money(e.amount) ?? 0, month: intIn(e.month, 1, 12) }))
      .filter((e) => e.name && e.amount > 0),
  livingExpense: money,
  emergencyMonths: (v) => intIn(v, 1, 24),
  otherAssets: (v) => text(v, 500),
  goals: (v) =>
    list(v)
      .map((e) => ({
        name: text(e.name, 60) ?? '',
        amount: money(e.amount) ?? 0,
        targetMonth: typeof e.targetMonth === 'string' && /^\d{4}-\d{2}$/.test(e.targetMonth) ? e.targetMonth : null,
        term: oneOf(e.term, ['short', 'mid', 'long'] as const) ?? 'mid',
      }))
      .filter((e) => e.name && e.amount > 0),
  savingTarget: money,
  savingRate: (v) => intIn(v, 1, 90),
  priorities: (v) => [
    ...new Set((Array.isArray(v) ? v : []).filter((p): p is PlanPriority => typeof p === 'string' && p in PLAN_PRIORITIES)),
  ],
  riskProfile: (v) => oneOf(v, ['conservative', 'balanced', 'aggressive', 'none'] as const),
  cutBack: (v) => text(v, 500),
  thoughts: (v) => text(v),
};

const KEYS = Object.keys(CLEAN) as Array<keyof typeof CLEAN>;

function empty(): Omit<FinancePlanProfile, 'updatedAt'> {
  return Object.fromEntries(KEYS.map((k) => [k, CLEAN[k](undefined)])) as Omit<FinancePlanProfile, 'updatedAt'>;
}

export function parseFinancePlanProfile(raw: unknown): FinancePlanProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const out = empty() as Record<string, unknown>;
  for (const k of KEYS) out[k] = CLEAN[k](obj[k]);
  out.updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date(0).toISOString();
  return out as unknown as FinancePlanProfile;
}

/** 新的回答蓋過舊的；沒帶（undefined）的欄位保留上次的，帶 null 就清掉。 */
export function mergeFinancePlanProfile(
  previous: FinancePlanProfile | null,
  input: FinancePlanProfileInput,
  now: Date,
): FinancePlanProfile {
  const out = { ...(previous ?? empty()) } as Record<string, unknown>;
  for (const k of KEYS) {
    if (input[k] !== undefined) out[k] = CLEAN[k](input[k]);
  }
  out.updatedAt = now.toISOString();
  return out as unknown as FinancePlanProfile;
}

/** 給 AI 看的中文整理（比 JSON 好懂，也避免它誤會英文代碼）。 */
export function profileForPrompt(p: FinancePlanProfile): string {
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  const lines = [
    `每月實拿收入：${p.monthlyIncome != null ? fmt(p.monthlyIncome) : '沒講'}${p.payDay ? `（每月 ${p.payDay} 號發薪）` : ''}`,
    `其他收入（一年）：${p.otherIncome.map((e) => `${e.name} ${fmt(e.annualAmount)}`).join('、') || '沒有'}`,
    `收入穩定度：${p.incomeStability ? STABILITY_LABEL[p.incomeStability] : '沒講'}${p.incomeChangeNote ? `（${p.incomeChangeNote}）` : ''}`,
    `每月固定支出：${p.fixedExpenses.map((e) => `${e.name} ${fmt(e.amount)}`).join('、') || '沒講'}（合計 ${fmt(p.fixedExpenses.reduce((s, e) => s + e.amount, 0))}）`,
    `一年一次的大筆支出：${p.annualExpenses.map((e) => `${e.name} ${fmt(e.amount)}${e.month ? `（${e.month} 月）` : ''}`).join('、') || '沒講'}（合計一年 ${fmt(p.annualExpenses.reduce((s, e) => s + e.amount, 0))}）`,
    `每月生活費（餐飲購物娛樂）：${p.livingExpense != null ? fmt(p.livingExpense) : '沒講'}`,
    `緊急預備金想留：${p.emergencyMonths ? `${p.emergencyMonths} 個月生活費` : '沒講（建議 6 個月）'}`,
    `其他投資或資產：${p.otherAssets ?? '沒講'}`,
    `目標：${p.goals.map((g) => `${g.name} ${fmt(g.amount)}（${g.targetMonth ? `${g.targetMonth} 前` : '沒講時間'}）`).join('、') || '沒講'}`,
    `每月想存：${p.savingTarget != null ? fmt(p.savingTarget) : p.savingRate != null ? `收入的 ${p.savingRate}%` : '沒講'}`,
    `優先順序（前面最重要）：${p.priorities.map((k) => PLAN_PRIORITIES[k]).join(' > ') || '沒講'}`,
    `投資風險偏好：${p.riskProfile ? RISK_LABEL[p.riskProfile] : '沒講'}`,
    `想減少的花費：${p.cutBack ?? '沒講'}`,
    `其他想法：${p.thoughts ?? '沒講'}`,
  ];
  return lines.join('\n');
}
