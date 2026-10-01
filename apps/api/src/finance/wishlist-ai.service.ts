import { Injectable } from '@nestjs/common';
import { WishlistService } from './wishlist.service';

export const WISHLIST_TOOLS = [
  {
    type: 'function' as const,
    name: 'list_wishlist',
    description:
      '購物車：想買的東西（id、價格、優先順序、目標日期）、每樣大概哪個月買得起（affordableMonth）、趕不趕得上目標日、每月撥多少買東西（monthlyBudget）、近 3 個月平均結餘。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'add_wishlist_item',
    description:
      '把想買的東西加進購物車。price 必填，使用者沒講價格就先問（可以幫他估個行情價問他對不對）。priority：1 高（很需要）、2 中（預設）、3 低（有閒錢再買）。targetDate：他說想在某天前買到才填 YYYY-MM-DD。加完用回傳的資料告訴他大概哪個月買得起。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        price: { type: 'number' },
        priority: { type: 'number', enum: [1, 2, 3] },
        targetDate: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['name', 'price'],
    },
  },
  {
    type: 'function' as const,
    name: 'update_wishlist_item',
    description: '改購物車裡的東西（價格變了、改優先順序、改目標日期），只填要改的。id 從 list_wishlist 找。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        price: { type: 'number' },
        priority: { type: 'number', enum: [1, 2, 3] },
        targetDate: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    type: 'function' as const,
    name: 'mark_wishlist_bought',
    description:
      '購物車的東西買了：標記已買（actualPrice 是實際花多少，沒講就用原價）。之後要再用 record_transaction 記一筆支出（照記帳流程問帳戶確認）。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, actualPrice: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    type: 'function' as const,
    name: 'remove_wishlist_item',
    description: '不想買了，從購物車拿掉。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    type: 'function' as const,
    name: 'set_wishlist_budget',
    description: '設定每月撥多少錢買購物車的東西；amount 給 -1＝回到預設（近 3 個月平均結餘的 30%）。',
    parameters: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
  },
];

export const WISHLIST_AI_GUIDE =
  '說「想買／想要／存錢買 X」→ add_wishlist_item（沒講價格先問）。問「什麼時候買得起」「購物車有什麼」→ list_wishlist。說「X 買了（多少錢）」而且購物車有 X → mark_wishlist_bought，再 record_transaction 記支出。做財務規劃或理財評估時，把購物車也算進去（list_wishlist），建議每月撥多少、哪樣先買、哪樣可以等。';

type Args = Record<string, unknown>;
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

@Injectable()
export class WishlistAiService {
  constructor(private readonly wishlist: WishlistService) {}

  static readonly toolNames = new Set(WISHLIST_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Args): Promise<unknown> {
    switch (name) {
      case 'list_wishlist':
        return this.wishlist.overview(userId);
      case 'add_wishlist_item': {
        const item = await this.wishlist.add(userId, {
          name: String(args.name ?? ''),
          price: Number(args.price),
          priority: num(args.priority),
          targetDate: str(args.targetDate) ?? null,
          note: str(args.note) ?? null,
        });
        const o = await this.wishlist.overview(userId);
        return { added: item.name, plan: o.items.find((i) => i.id === item.id), monthlyBudget: o.monthlyBudget, cartTotal: o.total };
      }
      case 'update_wishlist_item': {
        const item = await this.wishlist.update(userId, String(args.id ?? ''), {
          name: str(args.name),
          price: num(args.price),
          priority: num(args.priority),
          targetDate: str(args.targetDate),
          note: str(args.note),
        });
        return { updated: item.name };
      }
      case 'mark_wishlist_bought': {
        const item = await this.wishlist.markBought(userId, String(args.id ?? ''), num(args.actualPrice));
        return { bought: item.name, price: item.boughtPrice, next: '用 record_transaction 記這筆支出' };
      }
      case 'remove_wishlist_item':
        await this.wishlist.drop(userId, String(args.id ?? ''));
        return { removed: true };
      case 'set_wishlist_budget': {
        const amount = Number(args.amount);
        const o = await this.wishlist.setMonthlyBudget(userId, amount < 0 ? null : amount);
        return { monthlyBudget: o.monthlyBudget, items: o.items.map((i) => ({ name: i.name, affordableMonth: i.affordableMonth })) };
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}
