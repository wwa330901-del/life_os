/** 退休試算（2026-10-02）：全部用「今天的幣值」算——報酬率先扣掉通膨（實質報酬），
 * 這樣算出來的金額使用者看得懂（「退休時要有 1,200 萬」＝今天的 1,200 萬的購買力）。 */

export interface RetirementSettings {
  /** 想幾歲退休。 */
  retireAge: number;
  /** 預計活到幾歲（錢要夠用到這時候）。 */
  lifeExpectancy: number;
  /** 投資年報酬率（%）。 */
  returnRate: number;
  /** 通膨（%）。 */
  inflation: number;
  /** 退休後每月固定收入（勞保年金＋勞退月領之類，今天的幣值）。 */
  pensionMonthly: number;
  /** 退休金幾歲開始領（勞保老年年金 65 歲）；早退休的話中間要自己出全額。 */
  pensionStartAge: number;
  /** 退休後每月花多少；null＝用現在近 6 個月平均支出。 */
  monthlyExpense: number | null;
  /** 每月存多少；null＝用近 6 個月平均結餘。 */
  monthlySaving: number | null;
  /** 沒有生日時用的年齡。 */
  age: number | null;
}

export const DEFAULT_RETIREMENT_SETTINGS: RetirementSettings = {
  retireAge: 65,
  lifeExpectancy: 90,
  returnRate: 5,
  inflation: 2,
  pensionMonthly: 0,
  pensionStartAge: 65,
  monthlyExpense: null,
  monthlySaving: null,
  age: null,
};

export interface RetirementInputs {
  age: number;
  assets: number;
  monthlySaving: number;
  monthlyExpense: number;
  settings: RetirementSettings;
}

export interface RetirementProjection {
  age: number;
  retireAge: number;
  yearsToRetire: number;
  assets: number;
  monthlySaving: number;
  monthlyExpense: number;
  pensionMonthly: number;
  realReturnRate: number;
  /** 照現在的存法，退休那年會有多少。 */
  assetsAtRetire: number;
  /** 退休那年至少要有多少，才夠用到 lifeExpectancy。 */
  needAtRetire: number;
  /** 正的＝還差多少；負的＝多出來。 */
  gap: number;
  onTrack: boolean;
  /** 想準時退休，每月要存多少。 */
  requiredMonthlySaving: number;
  /** 照現在的存法最早幾歲可以退休（lifeExpectancy 前都不行就是 null）。 */
  earliestAge: number | null;
  /** 照現在的存法、在 retireAge 退休，錢會在幾歲用完（夠用就是 null）。 */
  depletionAge: number | null;
  /** 每年年底資產（圖表用）。 */
  series: Array<{ age: number; assets: number }>;
  /** 每月多存一點的話最早幾歲可以退休。 */
  scenarios: Array<{ extraMonthly: number; earliestAge: number | null }>;
}

const realMonthlyRate = (s: RetirementSettings) => Math.pow((1 + s.returnRate / 100) / (1 + s.inflation / 100), 1 / 12) - 1;

/** 現在有 assets、每月存 saving，n 個月後的錢。 */
function futureValue(assets: number, saving: number, rate: number, months: number): number {
  if (months <= 0) return assets;
  const growth = Math.pow(1 + rate, months);
  return assets * growth + (Math.abs(rate) < 1e-9 ? saving * months : (saving * (growth - 1)) / rate);
}

/** 每月要領 withdrawal、領 months 個月，一開始要有多少錢。 */
function presentValue(withdrawal: number, rate: number, months: number): number {
  if (months <= 0 || withdrawal <= 0) return 0;
  return Math.abs(rate) < 1e-9 ? withdrawal * months : (withdrawal * (1 - Math.pow(1 + rate, -months))) / rate;
}

/** 每月要領多少：退休金開始領之前自己出全額，之後扣掉退休金。 */
function withdrawalAt(input: RetirementInputs, age: number): number {
  const pension = age >= input.settings.pensionStartAge ? input.settings.pensionMonthly : 0;
  return Math.max(0, input.monthlyExpense - pension);
}

/** retire 歲退休、要夠用到 lifeExpectancy，退休那天要有多少錢。 */
function neededAt(input: RetirementInputs, retire: number, rate: number): number {
  const { settings } = input;
  const end = settings.lifeExpectancy;
  const switchAge = Math.min(end, Math.max(retire, settings.pensionStartAge));
  const before = presentValue(withdrawalAt(input, retire), rate, (switchAge - retire) * 12);
  const after = presentValue(withdrawalAt(input, switchAge), rate, (end - switchAge) * 12);
  return before + after / Math.pow(1 + rate, (switchAge - retire) * 12);
}

function earliestRetireAge(input: RetirementInputs, saving: number, rate: number): number | null {
  const { age, settings } = input;
  for (let retire = Math.ceil(age); retire < settings.lifeExpectancy; retire++) {
    const months = Math.round((retire - age) * 12);
    const have = futureValue(input.assets, saving, rate, months);
    const need = neededAt(input, retire, rate);
    if (have >= need) return retire;
  }
  return null;
}

export function projectRetirement(input: RetirementInputs): RetirementProjection {
  const { age, settings } = input;
  const rate = realMonthlyRate(settings);
  const retireAge = Math.max(settings.retireAge, Math.ceil(age));
  const months = Math.max(0, Math.round((retireAge - age) * 12));
  const assetsAtRetire = futureValue(input.assets, input.monthlySaving, rate, months);
  const needAtRetire = retireAge >= settings.lifeExpectancy ? 0 : neededAt(input, retireAge, rate);
  const gap = needAtRetire - assetsAtRetire;

  const growth = Math.pow(1 + rate, months);
  const requiredMonthlySaving =
    months <= 0
      ? 0
      : Math.max(0, Math.abs(rate) < 1e-9 ? (needAtRetire - input.assets) / months : ((needAtRetire - input.assets * growth) * rate) / (growth - 1));

  // 每年年底：退休前一直存，退休後每月領 withdrawal。
  const series: Array<{ age: number; assets: number }> = [];
  let balance = input.assets;
  let depletionAge: number | null = null;
  const startAge = Math.floor(age);
  for (let a = startAge; a <= settings.lifeExpectancy; a++) {
    series.push({ age: a, assets: Math.round(balance) });
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + rate) + (a < retireAge ? input.monthlySaving : -withdrawalAt(input, a));
    }
    if (depletionAge == null && a >= retireAge && balance < 0) depletionAge = a + 1;
  }

  return {
    age,
    retireAge,
    yearsToRetire: Math.round((months / 12) * 10) / 10,
    assets: Math.round(input.assets),
    monthlySaving: Math.round(input.monthlySaving),
    monthlyExpense: Math.round(input.monthlyExpense),
    pensionMonthly: Math.round(settings.pensionMonthly),
    realReturnRate: Math.round((Math.pow(1 + rate, 12) - 1) * 1000) / 10,
    assetsAtRetire: Math.round(assetsAtRetire),
    needAtRetire: Math.round(needAtRetire),
    gap: Math.round(gap),
    onTrack: gap <= 0,
    requiredMonthlySaving: Math.round(requiredMonthlySaving),
    earliestAge: earliestRetireAge(input, input.monthlySaving, rate),
    depletionAge,
    series,
    scenarios: [3000, 5000, 10000].map((extra) => ({
      extraMonthly: extra,
      earliestAge: earliestRetireAge(input, input.monthlySaving + extra, rate),
    })),
  };
}

/** 存在 Space.retirementSettings 的 JSON → 補上預設值。 */
export function parseRetirementSettings(raw: unknown): RetirementSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (key: keyof RetirementSettings) => {
    const v = obj[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  return {
    retireAge: num('retireAge') ?? DEFAULT_RETIREMENT_SETTINGS.retireAge,
    lifeExpectancy: num('lifeExpectancy') ?? DEFAULT_RETIREMENT_SETTINGS.lifeExpectancy,
    returnRate: num('returnRate') ?? DEFAULT_RETIREMENT_SETTINGS.returnRate,
    inflation: num('inflation') ?? DEFAULT_RETIREMENT_SETTINGS.inflation,
    pensionMonthly: num('pensionMonthly') ?? DEFAULT_RETIREMENT_SETTINGS.pensionMonthly,
    pensionStartAge: num('pensionStartAge') ?? DEFAULT_RETIREMENT_SETTINGS.pensionStartAge,
    monthlyExpense: num('monthlyExpense'),
    monthlySaving: num('monthlySaving'),
    age: num('age'),
  };
}

/** 檢查使用者要改的設定；不合理就丟中文錯誤。null＝改回自動。 */
export function validateRetirementPatch(patch: Partial<Record<keyof RetirementSettings, number | null>>): Partial<RetirementSettings> {
  const out: Partial<Record<keyof RetirementSettings, number | null>> = {};
  const range = (key: keyof RetirementSettings, min: number, max: number, label: string, nullable = false) => {
    if (!(key in patch)) return;
    const v = patch[key];
    if (v === null || v === undefined) {
      if (!nullable) throw new Error(`${label}不能空白`);
      out[key] = null;
      return;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${label}要在 ${min}～${max} 之間`);
    out[key] = v;
  };
  range('retireAge', 30, 90, '退休年齡');
  range('lifeExpectancy', 50, 120, '預計活到幾歲');
  range('returnRate', -5, 20, '年報酬率');
  range('inflation', 0, 15, '通膨');
  range('pensionMonthly', 0, 10_000_000, '每月退休金');
  range('pensionStartAge', 40, 90, '退休金開始領的年齡');
  range('monthlyExpense', 0, 10_000_000, '退休後每月花費', true);
  range('monthlySaving', -10_000_000, 10_000_000, '每月存多少', true);
  range('age', 15, 100, '年齡', true);
  return out as Partial<RetirementSettings>;
}

/** 生日 → 幾歲（含小數，算月份用）。 */
export function ageFromBirthDate(birthDate: Date, now: Date): number {
  return (now.getTime() - birthDate.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
}
