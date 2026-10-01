import { Injectable } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { describeDate } from './important-dates';

export const MEMORY_TOOLS = [
  {
    type: 'function' as const,
    name: 'remember',
    description:
      '記住一件關於使用者、長期有效的事（一句話，第三人稱，例如「不吃牛肉」「太太叫小美，喜歡多肉植物」「在台積電當工程師」）。跟已記得的某條是同一件事要更新 → 填 replaceId。',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string' }, replaceId: { type: 'string' } },
      required: ['content'],
    },
  },
  {
    type: 'function' as const,
    name: 'forget',
    description: '忘掉一條記憶（id 在系統提示「你記得關於他的事」裡）。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    type: 'function' as const,
    name: 'add_important_date',
    description:
      '記下每年重複的重要日子（生日、結婚紀念日、忌日…），會在前 7 天、前 1 天、當天提醒。title 例如「媽媽生日」。isLunar：使用者說農曆才 true。year：出生或開始的年份，知道才填（可以算幾歲、第幾週年）。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        month: { type: 'number' },
        day: { type: 'number' },
        year: { type: 'number' },
        isLunar: { type: 'boolean' },
        note: { type: 'string', description: '例如喜歡什麼、要準備什麼' },
      },
      required: ['title', 'month', 'day'],
    },
  },
  {
    type: 'function' as const,
    name: 'list_important_dates',
    description: '列出所有重要日子（id、名稱、日期、下一次是哪天、還有幾天）。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'update_important_date',
    description: '改重要日子（先 list_important_dates 找 id），只填要改的欄位。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        month: { type: 'number' },
        day: { type: 'number' },
        year: { type: 'number' },
        isLunar: { type: 'boolean' },
        note: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    type: 'function' as const,
    name: 'delete_important_date',
    description: '刪掉一個重要日子（先 list_important_dates 找 id）。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

export const MEMORY_AI_GUIDE = [
  '使用者講到關於自己、長期有效的事（喜好、不吃什麼、過敏、家人朋友是誰和他們的喜好、工作、住哪、習慣、在意的事）→ 順手 remember，回覆時自然帶一句「記住了」。一次性的小事（今天午餐吃什麼）不要記。',
  '使用者說「記住…」一定 remember；說「忘掉…」「那個不對」→ forget 或用 replaceId 更新。問「你記得我什麼」就照下面列給他看。',
  '講到某人的生日、紀念日 → add_important_date（同時可以 remember 那個人的喜好）。農曆要講清楚是農曆；沒講國曆農曆而且是長輩生日，先問一句是國曆還是農曆。',
  '給建議（吃什麼、送什麼禮、怎麼安排）時一定參考你記得的事。重要日子快到了可以主動問要不要幫忙想禮物、排時間或設預算。',
].join('\n');

type Args = Record<string, unknown>;
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

@Injectable()
export class MemoryAiService {
  constructor(private readonly memory: MemoryService) {}

  static readonly toolNames = new Set(MEMORY_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Args): Promise<unknown> {
    switch (name) {
      case 'remember': {
        const m = await this.memory.remember(userId, String(args.content ?? ''), str(args.replaceId));
        return { remembered: m.content };
      }
      case 'forget':
        return this.memory.forget(userId, String(args.id ?? ''));
      case 'add_important_date': {
        const d = await this.memory.addDate(userId, {
          title: String(args.title ?? ''),
          month: Number(args.month),
          day: Number(args.day),
          year: num(args.year) ?? null,
          isLunar: args.isLunar === true,
          note: str(args.note) ?? null,
        });
        const [withNext] = (await this.memory.listDates(userId)).filter((x) => x.id === d.id);
        return { saved: d.title, date: describeDate(d), next: withNext?.next, reminders: '前 7 天、前 1 天、當天 LINE 提醒' };
      }
      case 'list_important_dates':
        return (await this.memory.listDates(userId)).map((d) => ({
          id: d.id,
          title: d.title,
          date: describeDate(d),
          nextDate: d.next.date,
          daysLeft: d.next.daysLeft,
          years: d.next.years,
          note: d.note,
        }));
      case 'update_important_date': {
        const d = await this.memory.updateDate(userId, String(args.id ?? ''), {
          title: str(args.title),
          month: num(args.month),
          day: num(args.day),
          year: num(args.year),
          isLunar: typeof args.isLunar === 'boolean' ? args.isLunar : undefined,
          note: str(args.note),
        });
        return { updated: d.title, date: describeDate(d) };
      }
      case 'delete_important_date':
        return this.memory.deleteDate(userId, String(args.id ?? ''));
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}
