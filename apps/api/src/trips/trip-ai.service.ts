import { Injectable } from '@nestjs/common';
import { CalendarSyncTarget } from '../../generated/prisma/client.js';
import { TripsService } from './trips.service';
import { packingText, tripPlanText } from './trip';

const ITEM_SCHEMA = {
  type: 'object',
  properties: { time: { type: 'string' }, title: { type: 'string' }, place: { type: 'string' }, note: { type: 'string' } },
  required: ['title'],
};

export const TRIP_TOOLS = [
  {
    type: 'function' as const,
    name: 'plan_trip',
    description:
      '規劃一趟旅行並存起來：AI 排每日行程、估全部人合計的預算（交通/住宿/吃飯/門票/購物/其他）、列行李清單。destination、startDate、endDate（YYYY-MM-DD）必填——他只說「下個月去日本 5 天」就先問哪天出發；travelers 沒講就 1。style 是偏好（悠閒、美食、購物、親子、行程排滿…）。回傳的 planText 是整理好的行程，挑重點講（總預算、每天一句），再問他要不要放進行事曆、要不要放進購物車存錢。',
    parameters: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        travelers: { type: 'number' },
        style: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['destination', 'startDate', 'endDate'],
    },
  },
  {
    type: 'function' as const,
    name: 'list_trips',
    description: '他的旅行（id、目的地、日期、倒數幾天、預算、實際花費、行李還差幾樣、有沒有放進行事曆／購物車）。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'get_trip',
    description: '一趟旅行的完整內容：每日行程、預算、行李清單、實際花費（旅行期間的記帳支出）。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    type: 'function' as const,
    name: 'update_trip',
    description:
      '改旅行的基本資料（目的地、日期、人數、偏好、備註）或某幾項預算（budget 只填要改的：transport/lodging/food/tickets/shopping/other）。改了目的地、日期、人數或偏好之後，問他要不要 replan_trip 重新排行程。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        destination: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        travelers: { type: 'number' },
        style: { type: 'string' },
        notes: { type: 'string' },
        budget: {
          type: 'object',
          properties: {
            transport: { type: 'number' },
            lodging: { type: 'number' },
            food: { type: 'number' },
            tickets: { type: 'number' },
            shopping: { type: 'number' },
            other: { type: 'number' },
          },
        },
      },
      required: ['id'],
    },
  },
  {
    type: 'function' as const,
    name: 'replan_trip',
    description: '依現在的目的地、日期、人數、偏好重新排整趟行程和預算（已經打勾的行李會保留）。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    type: 'function' as const,
    name: 'set_trip_day',
    description:
      '改某一天的行程（「第二天改去鎌倉」「第一天晚上加一個燒肉」）：先 get_trip 看原本那天，再把那天整份新的 items 傳進來（time HH:mm、title、place、note）。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, date: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } },
      required: ['id', 'date', 'items'],
    },
  },
  {
    type: 'function' as const,
    name: 'pack_trip_items',
    description: '行李打勾（packed=true，「護照、充電器帶了」）或取消（false）；清單沒有的會自動加進去，所以「加一樣要帶的」也用這個（packed=false）。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, items: { type: 'array', items: { type: 'string' } }, packed: { type: 'boolean' } },
      required: ['id', 'items', 'packed'],
    },
  },
  {
    type: 'function' as const,
    name: 'add_trip_to_calendar',
    description: '把整趟旅行放進行事曆（一筆跨天全天行程）。target 規則跟 create_calendar_event 一樣：有連結就一定要先問存 Google 還是 iPhone。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, target: { type: 'string', enum: ['GOOGLE', 'ICLOUD'] } },
      required: ['id'],
    },
  },
  {
    type: 'function' as const,
    name: 'save_for_trip',
    description: '把這趟旅行放進購物車存錢（價格＝預估花費、期限＝出發日），回傳大概哪個月存得到、來不來得及、每月要撥多少。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    type: 'function' as const,
    name: 'delete_trip',
    description: '不去了，刪掉這趟旅行（購物車的存錢項目一起拿掉；行事曆上的行程不會自動刪，要跟他說）。他明確說不去／刪掉才用。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

export const TRIP_AI_GUIDE =
  '他說想去哪裡玩、要出國、幫我排旅行 → 問清楚目的地、出發和回來的日期（人數、偏好有講再帶）→ plan_trip，講重點後問要不要放進行事曆（add_trip_to_calendar，要問存哪邊）和購物車存錢（save_for_trip）。改某天行程用 set_trip_day；改日期、人數用 update_trip，再問要不要 replan_trip。講「X 帶了／準備好了」而且有快出發的旅行 → pack_trip_items。旅行中問「今天去哪」→ get_trip。旅行中的花費照一般記帳（record_transaction），會自動算進這趟的實際花費。';

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined;

@Injectable()
export class TripAiService {
  constructor(private readonly trips: TripsService) {}

  static readonly toolNames = new Set(TRIP_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Args): Promise<unknown> {
    const id = String(args.id ?? '');
    switch (name) {
      case 'plan_trip': {
        const t = await this.trips.create(userId, {
          destination: String(args.destination ?? ''),
          startDate: String(args.startDate ?? ''),
          endDate: String(args.endDate ?? ''),
          travelers: num(args.travelers),
          style: str(args.style) ?? null,
          notes: str(args.notes) ?? null,
        });
        const { targets } = await this.trips.calendarTargets(userId);
        return { id: t.id, planText: tripPlanText(t), packingCount: t.packingList.length, calendarTargets: targets };
      }
      case 'list_trips':
        return (await this.trips.list(userId)).map((t) => ({
          id: t.id,
          destination: t.destination,
          startDate: t.startDate,
          endDate: t.endDate,
          status: t.status,
          daysUntil: t.daysUntil,
          travelers: t.travelers,
          budgetTotal: t.budgetTotal,
          spent: t.spent,
          packing: packingText(t.packingList),
          inCalendar: t.inCalendar,
          inWishlist: t.inWishlist,
        }));
      case 'get_trip': {
        const t = await this.trips.get(userId, id);
        return { ...t, planText: tripPlanText(t), packing: packingText(t.packingList) };
      }
      case 'update_trip': {
        const budget = args.budget && typeof args.budget === 'object' ? (args.budget as Record<string, number>) : undefined;
        const t = await this.trips.update(userId, id, {
          destination: str(args.destination),
          startDate: str(args.startDate),
          endDate: str(args.endDate),
          travelers: num(args.travelers),
          ...(args.style !== undefined && { style: str(args.style) ?? null }),
          ...(args.notes !== undefined && { notes: str(args.notes) ?? null }),
          ...(budget && { budget }),
        });
        return { updated: true, destination: t.destination, startDate: t.startDate, endDate: t.endDate, travelers: t.travelers, budgetTotal: t.budgetTotal };
      }
      case 'replan_trip':
        return { planText: tripPlanText(await this.trips.replan(userId, id)) };
      case 'set_trip_day': {
        const items = (Array.isArray(args.items) ? (args.items as Array<Record<string, unknown>>) : [])
          .map((i) => ({ time: str(i.time) ?? null, title: str(i.title) ?? '', place: str(i.place) ?? null, note: str(i.note) ?? null }))
          .filter((i) => i.title);
        const t = await this.trips.setDay(userId, id, String(args.date ?? ''), items);
        return { updated: true, day: t.itinerary.find((d) => d.date === args.date) };
      }
      case 'pack_trip_items':
        return this.trips.pack(userId, id, (Array.isArray(args.items) ? args.items : []).map(String), args.packed !== false);
      case 'add_trip_to_calendar': {
        const target = args.target === 'GOOGLE' || args.target === 'ICLOUD' ? (args.target as CalendarSyncTarget) : null;
        return this.trips.addToCalendar(userId, id, target);
      }
      case 'save_for_trip':
        return this.trips.saveFor(userId, id);
      case 'delete_trip':
        return this.trips.remove(userId, id);
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}
