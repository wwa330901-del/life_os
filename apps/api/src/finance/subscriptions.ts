/** 訂閱費偵測（2026-10-02）：從記帳找出每月／每年固定扣的支出。純函式。 */

export interface ExpenseRow {
  date: string; // YYYY-MM-DD
  amount: number;
  note: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

export interface Subscription {
  key: string;
  name: string;
  amount: number;
  cycle: 'monthly' | 'yearly';
  /** 換算成每月多少（年繳÷12）。 */
  monthlyCost: number;
  lastDate: string;
  nextDate: string;
  charges: number;
}

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const median = (v: number[]) => {
  const s = [...v].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 同一個東西：有備註用備註（去空白、不分大小寫），沒有就用分類＋金額。 */
export function subscriptionKey(r: ExpenseRow): string | null {
  const note = r.note?.toLowerCase().replace(/[\s\-_.,，。:：()（）]/g, '') ?? '';
  if (note) return `n:${note}`;
  return r.categoryId ? `c:${r.categoryId}:${Math.round(r.amount)}` : null;
}

function addMonths(date: string, n: number, day: number): string {
  const [y, m] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function detectSubscriptions(rows: ExpenseRow[], today: string): Subscription[] {
  const groups = new Map<string, ExpenseRow[]>();
  for (const r of rows) {
    const key = subscriptionKey(r);
    if (key) groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const found: Subscription[] = [];
  for (const [key, list] of groups) {
    // 同一個月記了好幾筆只算最後一筆（避免重複記帳誤判）。
    const byMonth = new Map<string, ExpenseRow>();
    for (const r of [...list].sort((a, b) => a.date.localeCompare(b.date))) byMonth.set(r.date.slice(0, 7), r);
    const charges = [...byMonth.values()];
    if (charges.length < 2) continue;
    const amounts = charges.map((c) => c.amount);
    const mid = median(amounts);
    if (amounts.some((a) => Math.abs(a - mid) > mid * 0.15)) continue;
    const gaps = charges.slice(1).map((c, i) => days(charges[i].date, c.date));
    const last = charges[charges.length - 1];
    const name = last.note?.trim() || last.categoryName || '訂閱';
    const day = Math.round(median(charges.map((c) => Number(c.date.slice(8)))));

    const monthly = charges.length >= 3 && median(gaps) >= 25 && median(gaps) <= 35 && days(last.date, today) <= 45;
    const yearly = !monthly && gaps.length >= 1 && gaps.every((g) => g >= 350 && g <= 380) && days(last.date, today) <= 380;
    if (!monthly && !yearly) continue;

    let nextDate = addMonths(last.date, monthly ? 1 : 12, day);
    while (nextDate < today) nextDate = addMonths(nextDate, monthly ? 1 : 12, day);
    found.push({
      key,
      name,
      amount: Math.round(last.amount),
      cycle: monthly ? 'monthly' : 'yearly',
      monthlyCost: Math.round(monthly ? last.amount : last.amount / 12),
      lastDate: last.date,
      nextDate,
      charges: charges.length,
    });
  }
  return found.sort((a, b) => b.monthlyCost - a.monthlyCost);
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

export function subscriptionsText(subs: Subscription[]): string {
  if (subs.length === 0) {
    return '目前從記帳裡沒找到固定扣款的訂閱。\n（同一個東西要有連續 3 個月、金額差不多的紀錄才認得出來；記帳時備註寫一樣的名字，例如「Netflix」，比較好認）';
  }
  const monthly = subs.reduce((s, x) => s + x.monthlyCost, 0);
  return [
    `📺 找到 ${subs.length} 個固定扣款`,
    ...subs.map((s) => `・${s.name} ${fmt(s.amount)} 元／${s.cycle === 'monthly' ? '月' : '年'}，下次約 ${md(s.nextDate)}`),
    '',
    `每月合計約 ${fmt(monthly)} 元，一年約 ${fmt(monthly * 12)} 元`,
    '扣款前 3 天會提醒你（不想收到傳「關閉訂閱提醒」）',
  ].join('\n');
}

export function subscriptionReminderText(s: Subscription): string {
  return [
    `📺「${s.name}」大約 ${md(s.nextDate)} 會扣 ${fmt(s.amount)} 元（${s.cycle === 'monthly' ? `每月，一年約 ${fmt(s.amount * 12)} 元` : '每年'}）`,
    '還有在用嗎？不用的話記得在扣款前取消。',
  ].join('\n');
}
