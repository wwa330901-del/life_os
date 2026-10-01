import { Injectable } from '@nestjs/common';
import { taipeiDateKey } from '../common/taipei-date';
import { HealthRecordType } from '../../generated/prisma/client.js';
import { describeHealthRecord, HealthService } from './health.service';
import { formatMinutes, sleepFromClock } from './health-parse';

const TYPE_BY_NAME: Record<string, HealthRecordType> = {
  sleep: HealthRecordType.SLEEP,
  exercise: HealthRecordType.EXERCISE,
  weight: HealthRecordType.WEIGHT,
  steps: HealthRecordType.STEPS,
};

/** Gemini tool declarations for 健康 — composed into the 萬用 AI. */
export const HEALTH_TOOLS = [
  {
    type: 'function' as const,
    name: 'add_health_record',
    description:
      '記錄健康資料。type：sleep（睡眠）、exercise（運動）、weight（體重）、steps（步數）。' +
      '睡眠：有講幾點睡幾點起就填 bedtime/wakeTime（HH:MM，24 小時制，「12 點睡」＝00:00、「晚上 11 點半」＝23:30），只講睡幾小時就填 hours；date＝起床那天。' +
      '運動：activity（跑步、重訓、游泳、走路…）＋ minutes。體重：weightKg。步數：steps。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['sleep', 'exercise', 'weight', 'steps'] },
        date: { type: 'string', description: 'YYYY-MM-DD，不填＝今天' },
        bedtime: { type: 'string', description: 'HH:MM' },
        wakeTime: { type: 'string', description: 'HH:MM' },
        hours: { type: 'number' },
        activity: { type: 'string' },
        minutes: { type: 'integer' },
        weightKg: { type: 'number' },
        steps: { type: 'integer' },
        note: { type: 'string' },
      },
      required: ['type'],
    },
  },
  {
    type: 'function' as const,
    name: 'list_health_records',
    description: '查健康紀錄明細（睡眠、運動、體重、步數），可依種類和日期範圍。會附上 id，改或刪要用。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['sleep', 'exercise', 'weight', 'steps'] },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'get_health_summary',
    description: '最近幾天的健康統計：平均睡眠、睡不到 6 小時的天數、運動次數與分鐘、體重變化、平均步數。問「最近睡得怎樣」「這週運動幾次」用這個。',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', description: '預設 7' } },
    },
  },
  {
    type: 'function' as const,
    name: 'delete_health_record',
    description: '刪掉一筆記錯的健康紀錄（先 list_health_records 拿 id，跟使用者確認是哪一筆）。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

export const HEALTH_AI_GUIDE =
  '講到睡覺、起床、運動、體重、走了幾步就用 add_health_record 記下來（「昨晚 12 點睡 7 點起」「今天跑步 30 分鐘」「體重 70.5」），回一句簡短的話（睡太少或很久沒運動可以關心一下）。' +
  '問睡眠/運動/體重狀況用 get_health_summary 或 list_health_records。給健康建議要依真實數據，不做醫療診斷。' +
  '使用者問能不能自動記錄睡眠：跟他說到 App 的「健康」→「iPhone 自動記錄」照步驟設定 iPhone 捷徑。';

@Injectable()
export class HealthAiService {
  constructor(private readonly health: HealthService) {}

  static readonly toolNames = new Set(HEALTH_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'add_health_record':
        return this.add(userId, args);
      case 'list_health_records': {
        const records = await this.health.list(userId, {
          type: TYPE_BY_NAME[String(args.type)],
          from: typeof args.from === 'string' ? args.from : undefined,
          to: typeof args.to === 'string' ? args.to : undefined,
          limit: 40,
        });
        return records.map((r) => ({ id: r.id, text: describeHealthRecord(r), note: r.note }));
      }
      case 'get_health_summary': {
        const days = Number(args.days) || 7;
        const s = await this.health.statsLastDays(userId, days);
        return {
          days,
          sleep: s.sleep.averageMinutes != null ? { nights: s.sleep.nights, average: formatMinutes(s.sleep.averageMinutes), under6h: s.sleep.shortNights } : '沒有睡眠紀錄',
          exercise: s.exercise,
          weight: s.weight ?? '沒有體重紀錄',
          steps: s.steps.average != null ? s.steps : '沒有步數紀錄',
        };
      }
      case 'delete_health_record':
        return this.health.remove(userId, String(args.id));
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }

  private async add(userId: string, args: Record<string, unknown>) {
    const type = TYPE_BY_NAME[String(args.type)];
    if (!type) return { error: 'type 要是 sleep/exercise/weight/steps' };
    const date = typeof args.date === 'string' && args.date ? args.date.slice(0, 10) : taipeiDateKey(new Date());
    const note = typeof args.note === 'string' ? args.note : undefined;
    let record;
    switch (type) {
      case HealthRecordType.SLEEP: {
        const span =
          typeof args.bedtime === 'string' && typeof args.wakeTime === 'string' ? sleepFromClock(date, args.bedtime, args.wakeTime) : null;
        const hours = Number(args.hours);
        if (!span && !(hours > 0)) return { error: '要問他幾點睡幾點起，或睡了幾小時' };
        record = await this.health.create(userId, {
          type,
          date,
          ...(span ? { startAt: span.startAt, endAt: span.endAt } : { minutes: Math.round(hours * 60) }),
          note,
        }, 'AI');
        break;
      }
      case HealthRecordType.EXERCISE:
        record = await this.health.create(userId, {
          type,
          date,
          activity: typeof args.activity === 'string' ? args.activity : undefined,
          minutes: Number(args.minutes) > 0 ? Math.round(Number(args.minutes)) : undefined,
          note,
        }, 'AI');
        break;
      case HealthRecordType.WEIGHT:
        record = await this.health.create(userId, { type, date, value: Number(args.weightKg), note }, 'AI');
        break;
      case HealthRecordType.STEPS:
        record = await this.health.create(userId, { type, date, value: Number(args.steps), note }, 'AI');
        break;
    }
    const week = await this.health.statsLastDays(userId, 7);
    return {
      saved: describeHealthRecord(record),
      last7Days: {
        averageSleep: week.sleep.averageMinutes != null ? formatMinutes(week.sleep.averageMinutes) : null,
        nightsUnder6h: week.sleep.shortNights,
        exerciseSessions: week.exercise.sessions,
      },
    };
  }
}
