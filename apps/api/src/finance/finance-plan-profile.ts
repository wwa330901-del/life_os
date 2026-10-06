/** 財務規劃前先問使用者的（2026-10-07 使用者要求「應該先問過我有什麼支出或想法」）：
 * 每月收入、固定支出、想法目標。存在 Space.financePlanProfile，下次規劃直接帶出來讓他確認。 */
export interface FinancePlanProfile {
  /** 他自己說的每月收入（null＝沒講，用固定薪資或記帳平均）。 */
  monthlyIncome: number | null;
  fixedExpenses: Array<{ name: string; amount: number }>;
  /** 想法、目標、在意的事（想存多少、想買什麼、想投資、年底要出國…）。 */
  thoughts: string | null;
  updatedAt: string;
}

export interface FinancePlanProfileInput {
  monthlyIncome?: number | null;
  fixedExpenses?: Array<{ name?: unknown; amount?: unknown }>;
  thoughts?: string | null;
}

const MAX_EXPENSES = 30;

export function parseFinancePlanProfile(raw: unknown): FinancePlanProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  return {
    monthlyIncome: typeof obj.monthlyIncome === 'number' && obj.monthlyIncome > 0 ? obj.monthlyIncome : null,
    fixedExpenses: cleanExpenses(obj.fixedExpenses),
    thoughts: typeof obj.thoughts === 'string' && obj.thoughts.trim() ? obj.thoughts.trim() : null,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date(0).toISOString(),
  };
}

/** 新的回答蓋過舊的；沒帶的欄位保留上次的。 */
export function mergeFinancePlanProfile(
  previous: FinancePlanProfile | null,
  input: FinancePlanProfileInput,
  now: Date,
): FinancePlanProfile {
  const income = input.monthlyIncome === undefined ? previous?.monthlyIncome ?? null : input.monthlyIncome;
  return {
    monthlyIncome: typeof income === 'number' && Number.isFinite(income) && income > 0 ? Math.round(income) : null,
    fixedExpenses: input.fixedExpenses === undefined ? previous?.fixedExpenses ?? [] : cleanExpenses(input.fixedExpenses),
    thoughts:
      input.thoughts === undefined
        ? previous?.thoughts ?? null
        : typeof input.thoughts === 'string' && input.thoughts.trim()
          ? input.thoughts.trim().slice(0, 2000)
          : null,
    updatedAt: now.toISOString(),
  };
}

function cleanExpenses(raw: unknown): Array<{ name: string; amount: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>) : {}))
    .map((e) => ({ name: typeof e.name === 'string' ? e.name.trim().slice(0, 40) : '', amount: Number(e.amount) }))
    .filter((e) => e.name && Number.isFinite(e.amount) && e.amount > 0)
    .map((e) => ({ name: e.name, amount: Math.round(e.amount) }))
    .slice(0, MAX_EXPENSES);
}
