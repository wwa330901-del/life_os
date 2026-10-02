import { Injectable } from '@nestjs/common';
import { JournalService } from './journal.service';

const MOOD_LABEL = ['', '很差', '不太好', '普通', '不錯', '很好'];

/** Tool declarations for 日記 — composed into the 萬用 AI. */
export const JOURNAL_TOOLS = [
  {
    type: 'function' as const,
    name: 'add_journal_entry',
    description:
      '把使用者講的今天（或某天）發生的事、心情、想法記成日記。content 用使用者自己的話整理成通順的一段（保留細節，不要改成第三人稱）；mood 依內容判斷 1～5（1 很差、3 普通、5 很好）；tags 挑 1～3 個簡短主題（例如 工作、家人、運動、旅行）。',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        mood: { type: 'integer', minimum: 1, maximum: 5 },
        tags: { type: 'array', items: { type: 'string' } },
        date: { type: 'string', description: 'YYYY-MM-DD，不填＝今天' },
      },
      required: ['content'],
    },
  },
  {
    type: 'function' as const,
    name: 'update_journal_entry',
    description:
      '改或補充已經記過的日記（id 從 list_journal_entries 拿）。使用者說「再補一句」「剛剛那篇改成…」時用：補充就把新內容接在原本 content 後面整段傳回來，不要另外新增一篇；mood、tags 有變才填。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        content: { type: 'string', description: '改好後的完整內容' },
        mood: { type: 'integer', minimum: 1, maximum: 5 },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['id', 'content'],
    },
  },
  {
    type: 'function' as const,
    name: 'list_journal_entries',
    description: '查使用者的日記（可依日期範圍或關鍵字），例如「上個月心情怎樣」「我什麼時候去過宜蘭」。',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        keyword: { type: 'string' },
      },
    },
  },
];

export const JOURNAL_AI_GUIDE =
  '使用者在描述今天發生的事、心情、感想（不是要你做事）時，用 add_journal_entry 記成日記，回一句溫暖的話並說已經記下來；問過去的日記就 list_journal_entries。' +
  '同一天已經有日記、使用者是要補充或修改（「再補一句」「剛剛那篇改成」）→ 先 list_journal_entries 拿 id，再 update_journal_entry 把內容接上去，不要另開一篇。' +
  '補寫以前的日記（「補昨天的日記」「10/1 的日記」）就填 date；過了午夜才寫、內容在講「今天」白天的事，問他要記在昨天還是今天。';

@Injectable()
export class JournalAiService {
  constructor(private readonly journal: JournalService) {}

  static readonly toolNames = new Set(JOURNAL_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'add_journal_entry': {
        const mood = Number(args.mood);
        const entry = await this.journal.create(userId, {
          content: String(args.content ?? ''),
          ...(typeof args.date === 'string' && args.date && { date: args.date }),
          ...(mood >= 1 && mood <= 5 && { mood: Math.round(mood) }),
          ...(Array.isArray(args.tags) && { tags: args.tags.map(String).slice(0, 5) }),
        });
        return { saved: true, id: entry.id, date: entry.date.toISOString().slice(0, 10), mood: entry.mood, tags: entry.tags };
      }
      case 'update_journal_entry': {
        const mood = Number(args.mood);
        const entry = await this.journal.update(userId, String(args.id ?? ''), {
          content: String(args.content ?? ''),
          ...(mood >= 1 && mood <= 5 && { mood: Math.round(mood) }),
          ...(Array.isArray(args.tags) && { tags: args.tags.map(String).slice(0, 5) }),
        });
        return { saved: true, id: entry.id, date: entry.date.toISOString().slice(0, 10), content: entry.content };
      }
      case 'list_journal_entries': {
        const entries = await this.journal.list(userId, {
          from: typeof args.from === 'string' ? args.from : undefined,
          to: typeof args.to === 'string' ? args.to : undefined,
          keyword: typeof args.keyword === 'string' && args.keyword ? args.keyword : undefined,
          limit: 30,
        });
        return entries.map((e) => ({
          id: e.id,
          date: e.date.toISOString().slice(0, 10),
          content: e.content,
          mood: e.mood ? `${e.mood}（${MOOD_LABEL[e.mood]}）` : null,
          tags: e.tags,
        }));
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}
