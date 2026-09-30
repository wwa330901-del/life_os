/** 財務健檢（2026-10-01）——純規則、可解釋的 0～100 分。每一項都給「現況」
 * 跟「怎麼改善」，AI 只負責把它講成人話跟規劃，不自己打分數。 */

export interface HealthInputs {
  /** 近 3 個完整月份 */
  income3m: number;
  expense3m: number;
  /** 現金＋銀行帳戶餘額 */
  liquid: number;
  totalAssets: number;
  /** 借款未還＋信用卡欠款 */
  debt: number;
  netWorth: number;
  /** 上個月有設預算的分類數、其中沒超支的數量 */
  budgetCount: number;
  budgetsWithin: number;
  /** 持股市值、最大一檔的市值 */
  investedValue: number;
  largestHolding: number;
  /** 近 30 天有記帳的天數 */
  recordedDays30: number;
}

export interface HealthItem {
  key: string;
  label: string;
  score: number;
  max: number;
  /** 現況，例如「儲蓄率 18%」 */
  detail: string;
  /** 沒滿分時的具體建議；滿分為 null */
  tip: string | null;
}

export interface HealthResult {
  total: number;
  grade: string;
  items: HealthItem[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function computeFinanceHealth(i: HealthInputs): HealthResult {
  const items: HealthItem[] = [];
  const monthlyExpense = i.expense3m / 3;

  // 儲蓄率
  {
    const max = 25;
    if (i.income3m <= 0) {
      items.push({ key: 'savings', label: '儲蓄率', score: 0, max, detail: '近 3 個月沒有記到收入', tip: '把薪水等收入也記進來，才算得出存了多少' });
    } else {
      const rate = (i.income3m - i.expense3m) / i.income3m;
      const score = round1(clamp01(rate / 0.3) * max);
      const target = Math.max(0, i.income3m / 3 * 0.3 - (i.income3m - i.expense3m) / 3);
      items.push({
        key: 'savings',
        label: '儲蓄率',
        score,
        max,
        detail: `近 3 個月儲蓄率 ${Math.round(rate * 100)}%`,
        tip: score >= max ? null : `目標 30%：每月再少花或多存約 ${fmt(target)} 元`,
      });
    }
  }

  // 緊急預備金
  {
    const max = 20;
    if (monthlyExpense <= 0) {
      items.push({ key: 'emergency', label: '緊急預備金', score: max / 2, max, detail: '沒有支出記錄，算不出能撐幾個月', tip: '記幾個月的支出後就能算' });
    } else {
      const months = i.liquid / monthlyExpense;
      const score = round1(clamp01(months / 6) * max);
      items.push({
        key: 'emergency',
        label: '緊急預備金',
        score,
        max,
        detail: `現金＋存款可以撐 ${round1(Math.max(0, months))} 個月`,
        tip: score >= max ? null : `建議存到 6 個月生活費（約 ${fmt(monthlyExpense * 6)} 元），還差 ${fmt(monthlyExpense * 6 - i.liquid)} 元`,
      });
    }
  }

  // 負債比
  {
    const max = 15;
    const ratio = i.totalAssets > 0 ? i.debt / i.totalAssets : i.debt > 0 ? 1 : 0;
    const score = round1(clamp01(1 - ratio / 0.5) * max);
    items.push({
      key: 'debt',
      label: '負債比',
      score,
      max,
      detail: i.debt > 0 ? `負債 ${fmt(i.debt)}，佔資產 ${Math.round(ratio * 100)}%` : '沒有負債',
      tip: score >= max ? null : '先還利率最高的（通常是信用卡），再還其他借款',
    });
  }

  // 預算控管
  {
    const max = 15;
    if (i.budgetCount === 0) {
      items.push({ key: 'budget', label: '預算控管', score: 5, max, detail: '還沒設定預算', tip: '替花最多的 2～3 個分類設每月預算，超支會用 LINE 提醒你' });
    } else {
      const score = round1((i.budgetsWithin / i.budgetCount) * max);
      items.push({
        key: 'budget',
        label: '預算控管',
        score,
        max,
        detail: `上個月 ${i.budgetCount} 個預算有 ${i.budgetsWithin} 個沒超支`,
        tip: score >= max ? null : '超支的分類可以把預算調實際一點，或每週回顧時留意',
      });
    }
  }

  // 投資配置
  {
    const max = 15;
    if (i.investedValue <= 0) {
      items.push({ key: 'invest', label: '投資配置', score: 3, max, detail: '目前沒有投資', tip: '預備金存夠之後，可以考慮每月定期定額投入指數型 ETF' });
    } else {
      const ratio = i.netWorth > 0 ? i.investedValue / i.netWorth : 1;
      const allocation = ratio < 0.1 ? (ratio / 0.1) * 10 : ratio <= 0.7 ? 10 : 5;
      const concentration = i.largestHolding / i.investedValue;
      const spread = concentration <= 0.5 ? 5 : clamp01((1 - concentration) / 0.5) * 5;
      const score = round1(allocation + spread);
      const tips: string[] = [];
      if (ratio < 0.1) tips.push('投資比例偏低');
      if (ratio > 0.7) tips.push('投資佔淨資產超過七成，現金部位偏少');
      if (concentration > 0.5) tips.push(`最大一檔佔持股 ${Math.round(concentration * 100)}%，太集中`);
      items.push({
        key: 'invest',
        label: '投資配置',
        score,
        max,
        detail: `投資佔淨資產 ${Math.round(ratio * 100)}%`,
        tip: score >= max ? null : tips.join('；') || '可以再分散一點',
      });
    }
  }

  // 記帳習慣
  {
    const max = 10;
    const score = round1(clamp01(i.recordedDays30 / 20) * max);
    items.push({
      key: 'habit',
      label: '記帳習慣',
      score,
      max,
      detail: `近 30 天有 ${i.recordedDays30} 天記帳`,
      tip: score >= max ? null : '在 LINE 直接講「午餐 120」就能記，養成每天記的習慣',
    });
  }

  const total = Math.round(items.reduce((sum, it) => sum + it.score, 0));
  const grade = total >= 85 ? '優秀' : total >= 70 ? '良好' : total >= 50 ? '普通' : '需要加強';
  return { total, grade, items };
}
