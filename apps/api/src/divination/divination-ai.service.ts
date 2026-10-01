import { Injectable } from '@nestjs/common';
import { ACCURACY_LABEL, DivinationService } from './divination.service';

const ACCURACY_BY_NAME: Record<string, number> = { accurate: 3, partly: 2, inaccurate: 1 };

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
    name: 'get_birth_info',
    description: '查使用者已經存的出生日期和時間（和八字）。',
    parameters: { type: 'object', properties: {} },
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
    description: '看使用者之前算過的卦（id、題目、卦名、解卦、事後準不準）。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'record_divination_feedback',
    description:
      '記下之前算的卦事後準不準。accuracy：accurate（準）、partly（部分準）、inaccurate（不準）；feedback 用他的話簡短記下實際發生什麼。不知道是哪一筆就先 list_divinations 找（依題目對）。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        accuracy: { type: 'string', enum: ['accurate', 'partly', 'inaccurate'] },
        feedback: { type: 'string' },
      },
      required: ['id', 'accuracy'],
    },
  },
];

export const DIVINATION_AI_GUIDE =
  '只說「算命」「占卜」沒講要算什麼 → 先問他想算哪件事（例如「這次面試會不會上」），不要直接起卦；他回答後再起卦。使用者說想算什麼、問運勢、要占卜 → cast_meihua，把回傳的 interpretation 完整轉述給他（可以前面加一句卦名）。他講自己的生日 → set_birth_info（存一次就永久記住）。生辰存在系統裡，起卦時自動帶入，絕對不要叫他每次輸入或再問生日；cast_meihua 回傳的 birthInfo 是「還沒存」時，才在算完後提醒一次可以告訴你生日（和出生時間）讓解卦更準。他問自己存的生日 → get_birth_info。使用者講之前算的事後來怎樣（「上次算的面試真的上了」）→ record_divination_feedback。';

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
      case 'get_birth_info': {
        const profile = await this.divination.getProfile(userId);
        if (!profile.birthDate) return { birthInfo: '還沒存' };
        return { birthDate: profile.birthDate, birthTime: profile.birthTime ?? '時間不詳', ...profile.chart };
      }
      case 'cast_meihua': {
        const record = await this.divination.cast(userId, String(args.question ?? ''));
        const profile = await this.divination.getProfile(userId);
        return {
          hexagram: record.hexagram,
          interpretation: record.interpretation,
          birthInfo: profile.birthDate
            ? `已存（${profile.birthDate}${profile.birthTime ? ` ${profile.birthTime}` : '，時間不詳'}），解卦已參考`
            : '還沒存',
        };
      }
      case 'list_divinations': {
        const records = await this.divination.list(userId);
        return records.slice(0, 10).map((r) => ({
          id: r.id,
          date: r.createdAt.toISOString().slice(0, 10),
          result: r.accuracy ? `${ACCURACY_LABEL[r.accuracy]}${r.feedback ? `：${r.feedback}` : ''}` : '還沒回饋',
          question: r.question,
          hexagram: r.hexagram,
          interpretation: r.interpretation.slice(0, 200),
        }));
      }
      case 'record_divination_feedback': {
        const accuracy = ACCURACY_BY_NAME[String(args.accuracy)];
        if (!accuracy) return { error: 'accuracy 要是 accurate/partly/inaccurate' };
        const record = await this.divination.setFeedback(
          userId,
          String(args.id),
          accuracy,
          typeof args.feedback === 'string' ? args.feedback : null,
        );
        const stats = await this.divination.feedbackStats(userId);
        return { saved: true, question: record.question, result: ACCURACY_LABEL[accuracy], overall: stats };
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}
