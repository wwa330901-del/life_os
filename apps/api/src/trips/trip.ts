/** 旅行規劃（2026-10-02）的純函式：AI 草稿驗證、提醒時機、LINE 文字。 */

export const BUDGET_KEYS = ['transport', 'lodging', 'food', 'tickets', 'shopping', 'other'] as const;
export type BudgetKey = (typeof BUDGET_KEYS)[number];
export type TripBudget = Record<BudgetKey, number>;

export const BUDGET_LABEL: Record<BudgetKey, string> = {
  transport: '交通',
  lodging: '住宿',
  food: '吃飯',
  tickets: '門票・活動',
  shopping: '購物',
  other: '其他',
};

export interface ItineraryItem {
  time: string | null;
  title: string;
  place: string | null;
  note: string | null;
}

export interface ItineraryDay {
  date: string;
  items: ItineraryItem[];
}

export interface PackingItem {
  item: string;
  packed: boolean;
}

export interface TripDraft {
  latitude: number | null;
  longitude: number | null;
  budget: TripBudget;
  itinerary: ItineraryDay[];
  packingList: string[];
  tips: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;
const MS_PER_DAY = 86_400_000;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 旅行的每一天（含頭尾）。 */
export function tripDates(startDate: string, endDate: string): string[] {
  const n = daysBetween(startDate, endDate);
  return Array.from({ length: Math.max(0, n) + 1 }, (_, i) => addDays(startDate, i));
}

export function validateTripDates(startDate: string, endDate: string): string | null {
  if (!DATE.test(startDate) || !DATE.test(endDate)) return '日期格式要是 YYYY-MM-DD';
  const n = daysBetween(startDate, endDate);
  if (n < 0) return '回來的日期不能比出發早';
  if (n > 59) return '旅行最多排 60 天';
  return null;
}

/** 檢查 AI 回來的 JSON：日期一定要落在旅行期間、每天都要有、金額不能是負的。 */
export function parseTripDraft(raw: string, startDate: string, endDate: string): TripDraft {
  const d = JSON.parse(raw) as Record<string, unknown>;
  const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const rawBudget = (d.budget && typeof d.budget === 'object' ? d.budget : {}) as Record<string, unknown>;
  const budget = Object.fromEntries(BUDGET_KEYS.map((k) => [k, money(rawBudget[k])])) as TripBudget;

  const dates = tripDates(startDate, endDate);
  const byDate = new Map<string, ItineraryItem[]>();
  for (const day of Array.isArray(d.itinerary) ? (d.itinerary as Array<Record<string, unknown>>) : []) {
    const date = String(day?.date ?? '');
    if (!dates.includes(date)) continue;
    const items = (Array.isArray(day.items) ? (day.items as Array<Record<string, unknown>>) : [])
      .map((i) => ({
        time: str(i?.time) && TIME.test(String(i.time)) ? String(i.time).padStart(5, '0') : null,
        title: str(i?.title) ?? '',
        place: str(i?.place),
        note: str(i?.note),
      }))
      .filter((i) => i.title)
      .slice(0, 12);
    byDate.set(date, [...(byDate.get(date) ?? []), ...items]);
  }

  const lat = typeof d.latitude === 'number' && Math.abs(d.latitude) <= 90 ? d.latitude : null;
  const lon = typeof d.longitude === 'number' && Math.abs(d.longitude) <= 180 ? d.longitude : null;
  const packing = (Array.isArray(d.packingList) ? d.packingList : []).map(str).filter((p): p is string => !!p);
  return {
    latitude: lat != null && lon != null ? lat : null,
    longitude: lat != null && lon != null ? lon : null,
    budget,
    itinerary: dates.map((date) => ({ date, items: byDate.get(date) ?? [] })),
    packingList: [...new Set(packing)].slice(0, 40),
    tips: str(d.tips),
  };
}

export const budgetTotal = (b: TripBudget) => BUDGET_KEYS.reduce((s, k) => s + (b[k] ?? 0), 0);

/** 重新規劃時，已經打勾的行李保留打勾。 */
export function mergePacking(previous: PackingItem[], next: string[]): PackingItem[] {
  const packed = new Set(previous.filter((p) => p.packed).map((p) => p.item));
  const items = new Set(next);
  const kept = previous.filter((p) => p.packed && !items.has(p.item));
  return [...next.map((item) => ({ item, packed: packed.has(item) })), ...kept];
}

/** 打勾／取消：用名稱比對（AI 講「護照帶了」），找不到的當成新增。 */
export function setPacked(list: PackingItem[], names: string[], packed: boolean): { list: PackingItem[]; matched: string[]; added: string[] } {
  const next = list.map((p) => ({ ...p }));
  const matched: string[] = [];
  const added: string[] = [];
  for (const raw of names.map((n) => n.trim()).filter(Boolean)) {
    const hit = next.find((p) => p.item === raw) ?? next.find((p) => p.item.includes(raw) || raw.includes(p.item));
    if (hit) {
      hit.packed = packed;
      matched.push(hit.item);
    } else {
      next.push({ item: raw, packed });
      added.push(raw);
    }
  }
  return { list: next, matched, added };
}

export type TripReminderKind = '7d' | '1d' | 'after';

/** 今天要發哪一種提醒（已經發過就不發）。 */
export function dueReminder(today: string, startDate: string, endDate: string, sent: string): TripReminderKind | null {
  const done = new Set(sent.split(',').filter(Boolean));
  const until = daysBetween(today, startDate);
  if (until === 7 && !done.has('7d')) return '7d';
  if (until === 1 && !done.has('1d')) return '1d';
  if (daysBetween(endDate, today) === 1 && !done.has('after')) return 'after';
  return null;
}

export function tripStatus(today: string, startDate: string, endDate: string): 'upcoming' | 'ongoing' | 'done' {
  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'done';
  return 'ongoing';
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export interface TripLike {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget: TripBudget | null;
  budgetTotal: number | null;
  itinerary: ItineraryDay[];
  packingList: PackingItem[];
  tips: string | null;
}

export function tripPlanText(t: TripLike): string {
  const days = daysBetween(t.startDate, t.endDate) + 1;
  const lines = [`✈️ ${t.destination} ${days} 天（${md(t.startDate)}～${md(t.endDate)}${t.travelers > 1 ? `，${t.travelers} 人` : ''}）`];
  if (t.budget && t.budgetTotal) {
    lines.push('', `預估花費 ${fmt(t.budgetTotal)} 元`);
    lines.push(
      BUDGET_KEYS.filter((k) => t.budget![k] > 0)
        .map((k) => `${BUDGET_LABEL[k]} ${fmt(t.budget![k])}`)
        .join('・'),
    );
  }
  for (const [i, day] of t.itinerary.entries()) {
    if (!day.items.length) continue;
    lines.push('', `Day ${i + 1}（${md(day.date)}）`);
    for (const item of day.items) lines.push(`・${item.time ? `${item.time} ` : ''}${item.title}${item.place && item.place !== item.title ? `（${item.place}）` : ''}`);
  }
  if (t.tips) lines.push('', `💡 ${t.tips}`);
  return lines.join('\n');
}

export function packingText(list: PackingItem[]): string {
  const left = list.filter((p) => !p.packed).map((p) => p.item);
  if (!list.length) return '';
  return left.length ? `還沒準備（${left.length}/${list.length}）：${left.join('、')}` : `行李 ${list.length} 樣都準備好了 👍`;
}
