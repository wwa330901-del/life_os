import { Injectable } from '@nestjs/common';
import { DivinationService } from './divination.service';

export const DIVINATION_TOOLS = [
  {
    type: 'function' as const,
    name: 'set_birth_info',
    description: '記下使用者的出生日期（必填）和時間（不知道就不填），算命時會參考他的八字。',
    parameters: {
      type: 'object',
      properties: {
        birthDate: { type: 'string', description: 'YYYY-MM-DD（國曆）' },
        birthTime: { type: 'string', description: 'HH:mm，24 小時制' },
      },
      required: ['birthDate'],
    },
  },
  {
    type: 'function' as const,
    name: 'cast_meihua',
    description:
      '梅花易數：用現在的時間起卦，針對使用者想算的事解卦，回傳卦象和解卦內容。question 用使用者的原話整理成清楚的一句（例如「這次換工作順不順利」）。',
    parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
  },
  {
    type: 'function' as const,
    name: 'list_divinations',
    description: '看使用者之前算過的卦（題目、卦名、解卦）。',
    parameters: { type: 'object', properties: {} },
  },
];

export const DIVINATION_AI_GUIDE =
  '只說「算命」「占卜」沒講要算什麼 → 先問他想算哪件事（例如「這次面試會不會上」），不要直接起卦；他回答後再起卦。使用者說想算什麼、問運勢、要占卜 → cast_meihua，把回傳的 interpretation 完整轉述給他（可以前面加一句卦名）。他講自己的生日 → set_birth_info。還沒有生辰也可以直接算，算完順便提醒可以告訴你生日讓解卦更準。';

@Injectable()
export class DivinationAiService {
  constructor(private readonly divination: DivinationService) {}

  static readonly toolNames = new Set(DIVINATION_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'set_birth_info': {
        const profile = await this.divination.setProfile(
          userId,
          String(args.birthDate ?? ''),
          typeof args.birthTime === 'string' && args.birthTime ? args.birthTime : null,
        );
        return { saved: true, ...profile.chart };
      }
      case 'cast_meihua': {
        const record = await this.divination.cast(userId, String(args.question ?? ''));
        return { hexagram: record.hexagram, interpretation: record.interpretation };
      }
      case 'list_divinations': {
        const records = await this.divination.list(userId);
        return records.slice(0, 10).map((r) => ({
          date: r.createdAt.toISOString().slice(0, 10),
          question: r.question,
          hexagram: r.hexagram,
          interpretation: r.interpretation.slice(0, 200),
        }));
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}
