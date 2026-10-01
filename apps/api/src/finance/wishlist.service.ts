import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceTransactionsService } from './finance-transactions.service';
import { taipeiCurrentMonth, utcDateKey } from '../common/taipei-date';
import { WishlistStatus } from '../../generated/prisma/client.js';
import { defaultWishlistBudget, planPurchases, shiftMonth } from './wishlist';

export interface WishlistInput {
  name: string;
  price: number;
  priority?: number;
  targetDate?: string | null;
  note?: string | null;
}

const PRIORITY_LABEL: Record<number, string> = { 1: '高', 2: '中', 3: '低' };
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const monthLabel = (m: string, now: string) => (m === now ? '這個月' : `${m.slice(0, 4) === now.slice(0, 4) ? '' : `${m.slice(0, 4)}/`}${Number(m.slice(5))} 月`);

/** 購物車（2026-10-02）。 */
@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: FinanceTransactionsService,
  ) {}

  async spaceIdOf(userId: string): Promise<string> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId }, select: { id: true } });
    if (!space) throw new BadRequestException('找不到個人空間，請先登入 App 一次');
    return space.id;
  }

  /** 想買的東西＋什麼時候買得起；也是 AI 工具、App 頁、理財評估的資料。 */
  async overview(userId: string) {
    const spaceId = await this.spaceIdOf(userId);
    const month = taipeiCurrentMonth();
    const [space, items, recentlyBought, summaries] = await Promise.all([
      this.prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { wishlistMonthlyBudget: true } }),
      this.prisma.wishlistItem.findMany({ where: { spaceId, status: WishlistStatus.WANT } }),
      this.prisma.wishlistItem.findMany({
        where: { spaceId, status: WishlistStatus.BOUGHT },
        orderBy: { boughtAt: 'desc' },
        take: 10,
      }),
      Promise.all([1, 2, 3].map((n) => this.transactions.monthlySummary(userId, spaceId, shiftMonth(month, -n)))),
    ]);
    const avgIncome = summaries.reduce((s, x) => s + x.totalIncome, 0) / 3;
    const avgExpense = summaries.reduce((s, x) => s + x.totalExpense, 0) / 3;
    const suggested = defaultWishlistBudget(avgIncome, avgExpense);
    const monthlyBudget = space.wishlistMonthlyBudget ?? suggested;
    const plans = new Map(
      planPurchases(
        items.map((i) => ({ ...i, targetMonth: i.targetDate ? utcDateKey(i.targetDate).slice(0, 7) : null })),
        monthlyBudget,
        month,
      ).map((p) => [p.id, p]),
    );
    const ordered = [...plans.keys()].map((id) => items.find((i) => i.id === id)!);
    return {
      monthlyBudget,
      budgetIsCustom: space.wishlistMonthlyBudget != null,
      suggestedBudget: suggested,
      averageMonthlySurplus: Math.round(avgIncome - avgExpense),
      total: Math.round(items.reduce((s, i) => s + i.price, 0)),
      items: ordered.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        priority: i.priority,
        targetDate: i.targetDate ? utcDateKey(i.targetDate) : null,
        note: i.note,
        createdAt: i.createdAt,
        affordableMonth: plans.get(i.id)!.month,
        onTime: plans.get(i.id)!.onTime,
        neededMonthly: plans.get(i.id)!.neededMonthly,
      })),
      recentlyBought: recentlyBought.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        boughtPrice: i.boughtPrice,
        boughtAt: i.boughtAt,
      })),
    };
  }

  async add(userId: string, input: WishlistInput) {
    const spaceId = await this.spaceIdOf(userId);
    validate(input);
    return this.prisma.wishlistItem.create({
      data: {
        spaceId,
        name: input.name.trim(),
        price: input.price,
        priority: input.priority ?? 2,
        targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00Z`) : null,
        note: input.note?.trim() || null,
      },
    });
  }

  async update(userId: string, id: string, input: Partial<WishlistInput>) {
    await this.getOwned(userId, id);
    validate({ name: input.name ?? 'x', price: input.price ?? 1, priority: input.priority });
    return this.prisma.wishlistItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.targetDate !== undefined && { targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00Z`) : null }),
        ...(input.note !== undefined && { note: input.note?.trim() || null }),
      },
    });
  }

  /** 買了：標記已買（實際價格可以跟原本不同）。記帳另外走記帳流程。 */
  async markBought(userId: string, id: string, actualPrice?: number | null) {
    const item = await this.getOwned(userId, id);
    return this.prisma.wishlistItem.update({
      where: { id },
      data: { status: WishlistStatus.BOUGHT, boughtAt: new Date(), boughtPrice: actualPrice && actualPrice > 0 ? actualPrice : item.price },
    });
  }

  /** 不想買了。 */
  async drop(userId: string, id: string) {
    await this.getOwned(userId, id);
    return this.prisma.wishlistItem.update({ where: { id }, data: { status: WishlistStatus.DROPPED } });
  }

  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.prisma.wishlistItem.delete({ where: { id } });
    return { deleted: true };
  }

  /** 每月撥多少買東西；null＝回到預設（平均結餘的 30%）。 */
  async setMonthlyBudget(userId: string, amount: number | null) {
    const spaceId = await this.spaceIdOf(userId);
    if (amount != null && !(amount >= 0)) throw new BadRequestException('金額不對');
    await this.prisma.space.update({ where: { id: spaceId }, data: { wishlistMonthlyBudget: amount } });
    return this.overview(userId);
  }

  async text(userId: string): Promise<string> {
    const o = await this.overview(userId);
    const now = taipeiCurrentMonth();
    if (o.items.length === 0) {
      return '🛒 購物車是空的。\n想買什麼直接跟我說，例如「想買 AirPods 7490」，我會幫你排什麼時候買得起。';
    }
    return [
      `🛒 購物車（共 ${fmt(o.total)} 元）`,
      ...o.items.map((i) => {
        const when = i.affordableMonth ? `${monthLabel(i.affordableMonth, now)}買得起` : '目前排不出來';
        const late = i.onTime === false && i.neededMonthly ? `⚠️ 要趕上 ${i.targetDate!.slice(5).replace('-', '/')} 每月要撥 ${fmt(i.neededMonthly)}` : '';
        return `・${i.name} ${fmt(i.price)}（${PRIORITY_LABEL[i.priority] ?? '中'}）→ ${when}${late ? `\n  ${late}` : ''}`;
      }),
      '',
      o.monthlyBudget > 0
        ? `以每月撥 ${fmt(o.monthlyBudget)} 元計算${o.budgetIsCustom ? '' : `（近 3 個月平均結餘 ${fmt(o.averageMonthlySurplus)} 的 30%）`}`
        : `近 3 個月平均沒有結餘（${fmt(o.averageMonthlySurplus)}），排不出時間；可以說「每月撥 3000 買東西」自己設定`,
      '買了跟我說「AirPods 買了 6990」，我幫你劃掉並記帳。',
    ].join('\n');
  }

  private async getOwned(userId: string, id: string) {
    const spaceId = await this.spaceIdOf(userId);
    const item = await this.prisma.wishlistItem.findFirst({ where: { id, spaceId } });
    if (!item) throw new NotFoundException('購物車裡找不到這樣東西');
    return item;
  }
}

function validate(input: Pick<WishlistInput, 'name' | 'price' | 'priority'>) {
  if (!input.name?.trim()) throw new BadRequestException('要有名稱');
  if (!(input.price > 0)) throw new BadRequestException('價格要大於 0');
  if (input.priority !== undefined && ![1, 2, 3].includes(input.priority)) throw new BadRequestException('優先順序要是 1（高）、2（中）、3（低）');
}
