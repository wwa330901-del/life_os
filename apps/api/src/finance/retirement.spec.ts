import { DEFAULT_RETIREMENT_SETTINGS, parseRetirementSettings, projectRetirement, validateRetirementPatch } from './retirement';

const base = {
  age: 30,
  assets: 1_000_000,
  monthlySaving: 20_000,
  monthlyExpense: 30_000,
  settings: { ...DEFAULT_RETIREMENT_SETTINGS },
};

describe('projectRetirement', () => {
  it('零報酬時就是簡單加減', () => {
    const p = projectRetirement({ ...base, monthlySaving: 15_000, settings: { ...base.settings, returnRate: 0, inflation: 0 } });
    // 35 年 × 12 × 1.5 萬 + 100 萬
    expect(p.assetsAtRetire).toBe(1_000_000 + 15_000 * 12 * 35);
    // 25 年 × 12 × 3 萬
    expect(p.needAtRetire).toBe(30_000 * 12 * 25);
    expect(p.gap).toBe(p.needAtRetire - p.assetsAtRetire);
    expect(p.onTrack).toBe(false);
    // 要存 (900 萬 - 100 萬) / 420 個月
    expect(p.requiredMonthlySaving).toBe(Math.round(8_000_000 / 420));
  });

  it('退休金抵掉一部分花費', () => {
    const without = projectRetirement(base);
    const withPension = projectRetirement({ ...base, settings: { ...base.settings, pensionMonthly: 15_000 } });
    expect(withPension.needAtRetire).toBeLessThan(without.needAtRetire);
    expect(withPension.earliestAge!).toBeLessThanOrEqual(without.earliestAge!);
  });

  it('退休金 65 歲才領：60 歲退休要多準備 5 年全額', () => {
    const s = { ...base.settings, returnRate: 0, inflation: 0, pensionMonthly: 10_000, retireAge: 60 };
    const p = projectRetirement({ ...base, settings: s });
    // 60～65 歲 3 萬 × 60 個月 + 65～90 歲 2 萬 × 300 個月
    expect(p.needAtRetire).toBe(30_000 * 60 + 20_000 * 300);
  });

  it('多存一點最早退休年齡不會變晚', () => {
    const p = projectRetirement(base);
    expect(p.earliestAge).not.toBeNull();
    for (const s of p.scenarios) expect(s.earliestAge!).toBeLessThanOrEqual(p.earliestAge!);
  });

  it('存不夠會算出錢用完的年齡，夠的話是 null', () => {
    const poor = projectRetirement({ ...base, assets: 0, monthlySaving: 2_000 });
    expect(poor.onTrack).toBe(false);
    expect(poor.depletionAge).not.toBeNull();
    expect(poor.depletionAge!).toBeGreaterThan(65);
    const rich = projectRetirement({ ...base, assets: 30_000_000 });
    expect(rich.onTrack).toBe(true);
    expect(rich.depletionAge).toBeNull();
    expect(rich.requiredMonthlySaving).toBe(0);
  });

  it('圖表從現在的年齡畫到活到的年齡', () => {
    const p = projectRetirement(base);
    expect(p.series[0]).toEqual({ age: 30, assets: 1_000_000 });
    expect(p.series[p.series.length - 1].age).toBe(90);
  });
});

describe('設定', () => {
  it('沒存過就用預設值', () => {
    expect(parseRetirementSettings(null)).toEqual(DEFAULT_RETIREMENT_SETTINGS);
    expect(parseRetirementSettings({ retireAge: 60, monthlyExpense: 25000 }).retireAge).toBe(60);
  });

  it('不合理的數字擋下來', () => {
    expect(() => validateRetirementPatch({ retireAge: 200 })).toThrow('退休年齡');
    expect(() => validateRetirementPatch({ retireAge: null })).toThrow('不能空白');
    expect(validateRetirementPatch({ monthlyExpense: null })).toEqual({ monthlyExpense: null });
  });

  it('App 只改一項時，其他欄位是 undefined 不能當成空白', () => {
    // ValidationPipe 轉出的 DTO 每個欄位都存在，沒傳的是 undefined。
    const patch = { retireAge: undefined, lifeExpectancy: undefined, returnRate: 6, monthlyExpense: undefined };
    expect(validateRetirementPatch(patch)).toEqual({ returnRate: 6 });
  });
});
