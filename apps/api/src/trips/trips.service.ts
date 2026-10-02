import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { UserLocationService } from '../users/user-location.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { MemoryService } from '../memory/memory.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { WishlistService } from '../finance/wishlist.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { aiUnavailableMessage, AiUnavailableError } from '../ai/ai-errors';
import { agentModel, claudeJson, needClaudeKey, usageFields } from '../ai/claude';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight, utcDateKey } from '../common/taipei-date';
import { AiUsageStatus, CalendarSyncTarget, WishlistStatus } from '../../generated/prisma/client.js';
import type { Prisma, Trip } from '../../generated/prisma/client.js';
import {
  addDays,
  BUDGET_KEYS,
  budgetTotal,
  daysBetween,
  ItineraryDay,
  mergePacking,
  PackingItem,
  parseTripDraft,
  setPacked,
  TripBudget,
  TripDraft,
  tripPlanText,
  tripStatus,
  validateTripDates,
} from './trip';

export interface TripInput {
  destination: string;
  startDate: string;
  endDate: string;
  travelers?: number;
  style?: string | null;
  notes?: string | null;
}

export interface TripPatch {
  destination?: string;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  style?: string | null;
  notes?: string | null;
  budget?: Partial<TripBudget>;
  itinerary?: ItineraryDay[];
}

const SCHEMA = {
  type: 'object',
  properties: {
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    budget: {
      type: 'object',
      properties: Object.fromEntries(BUDGET_KEYS.map((k) => [k, { type: 'number' }])),
      required: [...BUDGET_KEYS],
    },
    itinerary: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { time: { type: 'string' }, title: { type: 'string' }, place: { type: 'string' }, note: { type: 'string' } },
              required: ['title'],
            },
          },
        },
        required: ['date', 'items'],
      },
    },
    packingList: { type: 'array', items: { type: 'string' } },
    tips: { type: 'string' },
  },
  required: ['latitude', 'longitude', 'budget', 'itinerary', 'packingList'],
};

const TARGET_LABEL: Record<CalendarSyncTarget, string> = { GOOGLE: 'Google 日曆', ICLOUD: 'iPhone 行事曆' };

/** 旅行規劃（2026-10-02）。 */
@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly userLocation: UserLocationService,
    private readonly aiUsage: AiUsageService,
    private readonly memory: MemoryService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly wishlist: WishlistService,
    private readonly transactions: FinanceTransactionsService,
  ) {}

  // --- 讀 ---

  async list(userId: string) {
    const today = taipeiDateKey(new Date());
    const trips = await this.prisma.trip.findMany({ where: { userId }, orderBy: { startDate: 'asc' } });
    const views = await Promise.all(trips.map((t) => this.view(t, today)));
    // 還沒去／正在玩的在前面（近的先），去過的在後面（新的先）。
    const active = views.filter((v) => v.status !== 'done');
    const done = views.filter((v) => v.status === 'done').reverse();
    return [...active, ...done];
  }

  async get(userId: string, id: string) {
    return this.view(await this.find(userId, id), taipeiDateKey(new Date()));
  }

  private async find(userId: string, id: string): Promise<Trip> {
    const trip = await this.prisma.trip.findFirst({ where: { id, userId } });
    if (!trip) throw new NotFoundException('找不到這趟旅行');
    return trip;
  }

  /** App／AI 看到的樣子：日期字串、狀態、倒數、實際花費（旅行期間個人空間的支出）。 */
  async view(t: Trip, today: string) {
    const startDate = utcDateKey(t.startDate);
    const endDate = utcDateKey(t.endDate);
    const status = tripStatus(today, startDate, endDate);
    let spent: number | null = null;
    let spentByCategory: Array<{ name: string; total: number }> = [];
    if (status !== 'upcoming') {
      const space = await this.prisma.space.findUnique({ where: { ownerUserId: t.userId }, select: { id: true } });
      if (space) {
        const s = await this.transactions.rangeSummary(
          t.userId,
          space.id,
          taipeiDateKeyToUtcMidnight(startDate),
          taipeiDateKeyToUtcMidnight(addDays(endDate, 1)),
        );
        spent = Math.round(s.totalExpense);
        spentByCategory = s.byCategory
          .filter((c) => c.kind === 'EXPENSE')
          .map((c) => ({ name: c.name, total: Math.round(c.total) }))
          .sort((a, b) => b.total - a.total);
      }
    }
    const wish = t.wishlistItemId ? await this.prisma.wishlistItem.findUnique({ where: { id: t.wishlistItemId } }) : null;
    return {
      id: t.id,
      destination: t.destination,
      startDate,
      endDate,
      days: daysBetween(startDate, endDate) + 1,
      daysUntil: daysBetween(today, startDate),
      status,
      travelers: t.travelers,
      style: t.style,
      latitude: t.latitude,
      longitude: t.longitude,
      budget: (t.budget as TripBudget | null) ?? null,
      budgetTotal: t.budgetTotal,
      itinerary: (t.itinerary as unknown as ItineraryDay[] | null) ?? [],
      packingList: (t.packingList as unknown as PackingItem[] | null) ?? [],
      tips: t.tips,
      notes: t.notes,
      inCalendar: t.calendarEventId != null,
      inWishlist: wish != null && wish.status === WishlistStatus.WANT,
      spent,
      spentByCategory,
    };
  }

  // --- 新增／規劃 ---

  /** plan=true：先用 AI 排行程、估預算、列行李再存（App「AI 幫我規劃」、AI 工具都走這裡）。 */
  async create(userId: string, input: TripInput, plan = true) {
    const destination = input.destination.trim();
    if (!destination) throw new BadRequestException('要去哪裡？');
    const err = validateTripDates(input.startDate, input.endDate);
    if (err) throw new BadRequestException(err);
    const travelers = Math.max(1, Math.min(50, Math.round(input.travelers ?? 1)));
    const draft = plan ? await this.draft(userId, { ...input, destination, travelers }) : null;
    const trip = await this.prisma.trip.create({
      data: {
        userId,
        destination,
        startDate: taipeiDateKeyToUtcMidnight(input.startDate),
        endDate: taipeiDateKeyToUtcMidnight(input.endDate),
        travelers,
        style: input.style?.trim() || null,
        notes: input.notes?.trim() || null,
        ...(draft && this.draftData(draft, [])),
      },
    });
    return this.view(trip, taipeiDateKey(new Date()));
  }

  /** 改了目的地/日期/偏好之後重新排；已經打勾的行李保留。 */
  async replan(userId: string, id: string) {
    const t = await this.find(userId, id);
    const draft = await this.draft(userId, {
      destination: t.destination,
      startDate: utcDateKey(t.startDate),
      endDate: utcDateKey(t.endDate),
      travelers: t.travelers,
      style: t.style,
      notes: t.notes,
    });
    const updated = await this.prisma.trip.update({
      where: { id },
      data: this.draftData(draft, (t.packingList as unknown as PackingItem[] | null) ?? []),
    });
    await this.syncWishlistPrice(updated);
    return this.view(updated, taipeiDateKey(new Date()));
  }

  private draftData(draft: TripDraft, previousPacking: PackingItem[]) {
    return {
      latitude: draft.latitude,
      longitude: draft.longitude,
      budget: draft.budget as unknown as Prisma.InputJsonValue,
      budgetTotal: budgetTotal(draft.budget),
      itinerary: draft.itinerary as unknown as Prisma.InputJsonValue,
      packingList: mergePacking(previousPacking, draft.packingList) as unknown as Prisma.InputJsonValue,
      tips: draft.tips,
    };
  }

  private async draft(userId: string, input: TripInput & { travelers: number }): Promise<TripDraft> {
    const user = await this.users.findById(userId);
    if (!user?.claudeApiKey) throw new BadRequestException(needClaudeKey('旅行規劃'));
    const [memoryContext, location] = await Promise.all([this.memory.contextText(userId), this.userLocation.get(userId)]);
    const days = daysBetween(input.startDate, input.endDate) + 1;
    const prompt = [
      '你是很會排行程的旅遊規劃師，幫使用者排一趟實際走得完的旅行。',
      `今天是 ${taipeiDateKey(new Date())}。`,
      `目的地：${input.destination}`,
      `日期：${input.startDate} 出發，${input.endDate} 回來，共 ${days} 天，${input.travelers} 人。`,
      location ? `他住在／目前在：${location.name}（從這裡出發，估交通費用）。` : '他從台灣出發。',
      input.style?.trim() ? `偏好：${input.style.trim()}` : '',
      input.notes?.trim() ? `補充：${input.notes.trim()}` : '',
      `關於他（長期記憶，飲食禁忌、喜好要照顧到）：\n${memoryContext}`,
      '',
      '回傳 JSON，繁體中文、簡短：',
      '- latitude/longitude：目的地的經緯度。',
      `- budget：全部 ${input.travelers} 人合計的預估花費（新台幣，用現在的行情）：transport（來回機票/車票＋當地交通）、lodging（住宿）、food（吃飯）、tickets（門票、活動）、shopping（伴手禮、購物，抓一般值）、other（網卡、保險、雜支）。`,
      `- itinerary：每天一筆（date 用 YYYY-MM-DD，${input.startDate}～${input.endDate} 每天都要有），items 3～6 個：time（HH:mm）、title（做什麼）、place（地點）、note（一句提醒，可不填）。第一天和最後一天要考慮交通移動時間；同一天的景點要順路。`,
      '- packingList：10～20 樣要帶的東西，依目的地、季節、天數（出國要護照、轉接頭、網卡；冬天要保暖…）。',
      '- tips：一句最重要的提醒（簽證、天氣、訂位、交通卡…）。',
    ]
      .filter((l) => l !== '')
      .join('\n');

    const startedAt = Date.now();
    const model = agentModel();
    try {
      const res = await claudeJson<unknown>({ apiKey: user.claudeApiKey, model, content: prompt, schema: SCHEMA });
      await this.aiUsage.record({
        userId,
        feature: 'trip_plan',
        model,
        ...usageFields(res.usage),
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });
      return parseTripDraft(res.text, input.startDate, input.endDate);
    } catch (error) {
      await this.aiUsage.record({
        userId,
        feature: 'trip_plan',
        model,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof AiUnavailableError) throw new BadRequestException(aiUnavailableMessage(error));
      this.logger.warn(`旅行規劃失敗（userId=${userId}）：${String(error)}`);
      throw new BadRequestException('旅行規劃產生失敗，請稍後再試一次');
    }
  }

  // --- 修改 ---

  async update(userId: string, id: string, patch: TripPatch) {
    const t = await this.find(userId, id);
    const startDate = patch.startDate ?? utcDateKey(t.startDate);
    const endDate = patch.endDate ?? utcDateKey(t.endDate);
    const err = validateTripDates(startDate, endDate);
    if (err) throw new BadRequestException(err);
    const data: Prisma.TripUpdateInput = {};
    if (patch.destination !== undefined) {
      if (!patch.destination.trim()) throw new BadRequestException('目的地不能空白');
      data.destination = patch.destination.trim();
    }
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
      data.startDate = taipeiDateKeyToUtcMidnight(startDate);
      data.endDate = taipeiDateKeyToUtcMidnight(endDate);
      // 日期改了提醒要重新算。
      data.remindersSent = '';
    }
    if (patch.travelers !== undefined) data.travelers = Math.max(1, Math.min(50, Math.round(patch.travelers)));
    if (patch.style !== undefined) data.style = patch.style?.trim() || null;
    if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
    if (patch.budget !== undefined) {
      const current = (t.budget as TripBudget | null) ?? (Object.fromEntries(BUDGET_KEYS.map((k) => [k, 0])) as TripBudget);
      const next = { ...current };
      for (const k of BUDGET_KEYS) {
        const v = patch.budget[k];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) next[k] = Math.round(v);
      }
      data.budget = next as unknown as Prisma.InputJsonValue;
      data.budgetTotal = budgetTotal(next);
    }
    if (patch.itinerary !== undefined) data.itinerary = patch.itinerary as unknown as Prisma.InputJsonValue;
    const updated = await this.prisma.trip.update({ where: { id }, data });
    await this.syncWishlistPrice(updated);
    return this.view(updated, taipeiDateKey(new Date()));
  }

  /** 改某一天的行程（AI「第二天改去淺草」）。 */
  async setDay(userId: string, id: string, date: string, items: ItineraryDay['items']) {
    const t = await this.find(userId, id);
    const itinerary = (t.itinerary as unknown as ItineraryDay[] | null) ?? [];
    if (date < utcDateKey(t.startDate) || date > utcDateKey(t.endDate)) throw new BadRequestException('這天不在旅行期間');
    const next = itinerary.some((d) => d.date === date)
      ? itinerary.map((d) => (d.date === date ? { date, items } : d))
      : [...itinerary, { date, items }].sort((a, b) => a.date.localeCompare(b.date));
    return this.update(userId, id, { itinerary: next });
  }

  async pack(userId: string, id: string, items: string[], packed: boolean) {
    const t = await this.find(userId, id);
    const r = setPacked((t.packingList as unknown as PackingItem[] | null) ?? [], items, packed);
    await this.prisma.trip.update({ where: { id }, data: { packingList: r.list as unknown as Prisma.InputJsonValue } });
    return { matched: r.matched, added: r.added, left: r.list.filter((p) => !p.packed).map((p) => p.item) };
  }

  /** App 直接送整份清單（打勾、刪除、新增）。 */
  async setPackingList(userId: string, id: string, list: PackingItem[]) {
    await this.find(userId, id);
    const clean = list
      .map((p) => ({ item: String(p.item ?? '').trim(), packed: p.packed === true }))
      .filter((p) => p.item)
      .slice(0, 100);
    const updated = await this.prisma.trip.update({ where: { id }, data: { packingList: clean as unknown as Prisma.InputJsonValue } });
    return this.view(updated, taipeiDateKey(new Date()));
  }

  async remove(userId: string, id: string) {
    const t = await this.find(userId, id);
    // 購物車裡還沒「買」的存錢項目一起拿掉；行事曆上的行程留著（可能已經跟別人共享），跟使用者說。
    if (t.wishlistItemId) {
      await this.prisma.wishlistItem.deleteMany({ where: { id: t.wishlistItemId, status: WishlistStatus.WANT } });
    }
    await this.prisma.trip.delete({ where: { id } });
    return { removed: true, calendarEventKept: t.calendarEventId != null };
  }

  // --- 行事曆／存錢 ---

  async calendarTargets(userId: string): Promise<{ spaceId: string | null; targets: CalendarSyncTarget[] }> {
    const calendar = await this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId }, select: { id: true } });
    if (!calendar) return { spaceId: null, targets: [] };
    const [google, apple] = await Promise.all([
      this.prisma.googleCalendarConnection.findUnique({ where: { spaceId: calendar.id }, select: { id: true } }),
      this.prisma.appleCalendarConnection.findUnique({ where: { spaceId: calendar.id }, select: { id: true } }),
    ]);
    return {
      spaceId: calendar.id,
      targets: [...(google ? [CalendarSyncTarget.GOOGLE] : []), ...(apple ? [CalendarSyncTarget.ICLOUD] : [])],
    };
  }

  /** 整趟旅行放進行事曆（一筆跨天的全天行程，備註放每日行程）。有連外部行事曆就一定要選存哪邊。 */
  async addToCalendar(userId: string, id: string, target?: CalendarSyncTarget | null) {
    const t = await this.find(userId, id);
    if (t.calendarEventId) {
      const exists = await this.prisma.calendarEvent.findUnique({ where: { id: t.calendarEventId }, select: { id: true } });
      if (exists) return { alreadyAdded: true };
    }
    const { spaceId, targets } = await this.calendarTargets(userId);
    if (!spaceId) throw new BadRequestException('還沒有行事曆，請先到 App 開啟行事曆');
    if (targets.length > 0 && (!target || !targets.includes(target))) {
      throw new BadRequestException(`要存到哪一邊？可以選：${targets.map((x) => TARGET_LABEL[x]).join('、')}`);
    }
    const v = await this.view(t, taipeiDateKey(new Date()));
    const notes = tripPlanText({ ...v, packingList: [] });
    const event = await this.calendarEvents.create(userId, spaceId, {
      title: `✈️ ${t.destination}`,
      startAt: v.startDate,
      endAt: v.endDate,
      allDay: true,
      notes: notes.slice(0, 4000),
      ...(target && targets.includes(target) && { syncTarget: target }),
    });
    await this.prisma.trip.update({ where: { id }, data: { calendarEventId: event.id } });
    return { added: true, savedTo: target && targets.includes(target) ? TARGET_LABEL[target] : '元序' };
  }

  /** 放進購物車：價格＝預估花費，期限＝出發日 → 理財評估、購物車排程都會算進去。 */
  async saveFor(userId: string, id: string) {
    const t = await this.find(userId, id);
    if (!t.budgetTotal) throw new BadRequestException('這趟還沒有預估花費，先讓 AI 規劃一次或自己填預算');
    if (t.wishlistItemId) {
      const existing = await this.prisma.wishlistItem.findUnique({ where: { id: t.wishlistItemId } });
      if (existing?.status === WishlistStatus.WANT) return { alreadyAdded: true };
    }
    const item = await this.wishlist.add(userId, {
      name: `旅行：${t.destination}`,
      price: t.budgetTotal,
      priority: 2,
      targetDate: utcDateKey(t.startDate),
      note: `${utcDateKey(t.startDate)} 出發`,
    });
    await this.prisma.trip.update({ where: { id }, data: { wishlistItemId: item.id } });
    const o = await this.wishlist.overview(userId);
    const plan = o.items.find((i) => i.id === item.id);
    return { added: true, affordableMonth: plan?.affordableMonth ?? null, onTime: plan?.onTime ?? null, neededMonthly: plan?.neededMonthly ?? null };
  }

  private async syncWishlistPrice(t: Trip) {
    if (!t.wishlistItemId || !t.budgetTotal) return;
    await this.prisma.wishlistItem.updateMany({
      where: { id: t.wishlistItemId, status: WishlistStatus.WANT },
      data: { price: t.budgetTotal, targetDate: t.startDate },
    });
  }
}
