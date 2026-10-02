import { Injectable } from '@nestjs/common';
import { RetirementService } from './retirement.service';
import type { RetirementSettings } from './retirement';

const WHAT_IF_PROPS = {
  retireAge: { type: 'number', description: '幾歲退休' },
  monthlySaving: { type: 'number', description: '每月存多少（不填＝近 6 個月平均結餘）' },
  monthlyExpense: { type: 'number', description: '退休後每月花多少（不填＝近 6 個月平均支出）' },
  returnRate: { type: 'number', description: '投資年報酬率 %' },
  pensionMonthly: { type: 'number', description: '退休後每月固定收入（勞保年金＋勞退）' },
  pensionStartAge: { type: 'number', description: '退休金幾歲開始領（預設 65）' },
};

export const RETIREMENT_TOOLS = [
  {
    type: 'function' as const,
    name: 'get_retirement_projection',
    description:
      '退休試算（用今天的幣值）：照他現在的淨資產、每月結餘、花費，算退休時會有多少、需要多少、還差多少、每月要存多少、最早幾歲能退休、錢幾歲用完、多存 3000/5000/10000 最早幾歲。參數都不填＝用他存的設定；問「如果 60 歲退休」「每月多存 5000」這種假設就填參數試算（不會存起來）。needsAge=true 代表不知道他幾歲，要先問生日。',
    parameters: { type: 'object', properties: WHAT_IF_PROPS },
  },
  {
    type: 'function' as const,
    name: 'set_retirement_settings',
    description:
      '存退休試算的設定（他說「我想 55 歲退休」「勞保加勞退大概每月 2 萬」「我 32 歲」這種要記住的）。只填要改的；monthlySaving/monthlyExpense 給 -1＝改回自動（用記帳平均）。存完會回傳新的試算。',
    parameters: {
      type: 'object',
      properties: {
        ...WHAT_IF_PROPS,
        lifeExpectancy: { type: 'number', description: '錢要夠用到幾歲（預設 90）' },
        inflation: { type: 'number', description: '通膨 %（預設 2）' },
        age: { type: 'number', description: '他現在幾歲（沒存生日才用）' },
      },
    },
  },
];

export const RETIREMENT_AI_GUIDE =
  '問退休（「我幾歲可以退休」「退休要存多少」「這樣存夠不夠」）→ get_retirement_projection，用 2～4 句講重點：幾歲時會有多少／需要多少、夠不夠、每月要存多少或最早幾歲能退、一個具體建議（多存多少、降低花費、提高報酬的風險要講）。needsExpense 就先問退休後每月大概花多少。needsAge 就先問生日（知道生日用 set_birth_info 存，只知道年紀用 set_retirement_settings 的 age）。他講要記住的退休條件就 set_retirement_settings。數字是公式算的，照實說；報酬率是假設、不保證。';

type Args = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

@Injectable()
export class RetirementAiService {
  constructor(private readonly retirement: RetirementService) {}

  static readonly toolNames = new Set(RETIREMENT_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Args): Promise<unknown> {
    switch (name) {
      case 'get_retirement_projection': {
        const r = await this.retirement.forUser(userId, {
          retireAge: num(args.retireAge),
          monthlySaving: num(args.monthlySaving),
          monthlyExpense: num(args.monthlyExpense),
          returnRate: num(args.returnRate),
          pensionMonthly: num(args.pensionMonthly),
          pensionStartAge: num(args.pensionStartAge),
        });
        return summarize(r);
      }
      case 'set_retirement_settings': {
        const patch: Partial<Record<keyof RetirementSettings, number | null>> = {};
        for (const key of ['retireAge', 'lifeExpectancy', 'returnRate', 'inflation', 'pensionMonthly', 'pensionStartAge', 'age'] as const) {
          const v = num(args[key]);
          if (v !== undefined) patch[key] = v;
        }
        for (const key of ['monthlySaving', 'monthlyExpense'] as const) {
          const v = num(args[key]);
          if (v !== undefined) patch[key] = v === -1 ? null : v;
        }
        return { saved: true, ...summarize(await this.retirement.updateSettings(userId, patch)) };
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}

/** 圖表用的逐年資料太長，AI 只要重點。 */
function summarize(r: Awaited<ReturnType<RetirementService['forUser']>>) {
  if (!r.projection) return { needsAge: true, needsExpense: r.needsExpense, auto: r.auto };
  if (r.needsExpense) return { needsExpense: true, note: '沒有記帳資料，先問他退休後每月大概花多少，用 set_retirement_settings 的 monthlyExpense 存', auto: r.auto };
  const { series, ...rest } = r.projection;
  return { ...rest, lifeExpectancy: r.settings.lifeExpectancy, inflation: r.settings.inflation, returnRate: r.settings.returnRate, autoNumbers: r.auto, assetsEvery10Years: series.filter((s) => s.age % 10 === 0) };
}
