import { Injectable } from '@nestjs/common';
import {
  LifeGoalPeriod,
  LifeGoalStatus,
  LifeGoalTrackingType,
} from '../../generated/prisma/client.js';
import { LifeGoalsService } from './life-goals.service';

const TRACKING_LABEL: Record<LifeGoalTrackingType, string> = {
  MANUAL: '手動更新數字',
  ACCOUNT_BALANCE: '自動：帳戶餘額',
  NET_WORTH: '自動：淨資產',
  NOTE_KEYWORD_SUM: '自動：記帳備註關鍵字累計',
  STOCK_VALUE: '自動：持股市值',
  CHECK_IN: '打卡',
};

/** Gemini Interactions API tool declarations for 人生目標 — composed into
 * the LINE 萬用 AI (`AiAgentService`) alongside every other module's tools. */
export const LIFE_GOAL_TOOLS = [
  {
    type: 'function' as const,
    name: 'list_life_goals',
    description: '列出使用者所有進行中的人生目標（含 id、追蹤方式、目前數字、目標數字、打卡是否必須寫心得）。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'set_goal_value',
    description: '把「手動更新數字」型目標的目前數字改成指定值（例如體重現在 72）。只能用在追蹤方式是手動的目標。',
    parameters: {
      type: 'object',
      properties: { goalId: { type: 'string' }, value: { type: 'number' } },
      required: ['goalId', 'value'],
    },
  },
  {
    type: 'function' as const,
    name: 'add_check_in',
    description:
      '替「打卡」型目標新增一筆打卡（讀完一本書、運動一次…）。title 是這次做了什麼（例如書名），note 是心得或最喜歡的一句話；目標若要求必須寫心得，沒有 note 會失敗，這時要先問使用者。value 預設 1，有數量時（跑了 5 公里）才填。',
    parameters: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        title: { type: 'string' },
        note: { type: 'string' },
        value: { type: 'number' },
        date: { type: 'string', description: 'YYYY-MM-DD，不填則為今天' },
      },
      required: ['goalId'],
    },
  },
  {
    type: 'function' as const,
    name: 'create_goal',
    description:
      '新增人生目標。trackingType：MANUAL（手動數字，例如體重）、CHECK_IN（打卡，例如讀書、運動）、NET_WORTH（淨資產）、NOTE_KEYWORD_SUM（記帳備註含關鍵字的存款累計，需 trackingKeyword）、ACCOUNT_BALANCE（指定帳戶餘額，需 accountName）。讀書類目標請設 CHECK_IN 且 requireCheckInNote=true。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: {
          type: 'string',
          description:
            '優先沿用使用者已有、意思最接近的目標分類（例如「閱讀」歸到已有的「看書」），但不同性質的事不要只因為上位概念相同就合併（閱讀跟上課不同）；都不接近才用新的具體分類',
        },
        trackingType: {
          type: 'string',
          enum: ['MANUAL', 'CHECK_IN', 'NET_WORTH', 'NOTE_KEYWORD_SUM', 'ACCOUNT_BALANCE'],
        },
        targetValue: { type: 'number' },
        currentValue: { type: 'number', description: '只有 MANUAL 用得到' },
        unit: { type: 'string' },
        targetDate: { type: 'string', description: 'YYYY-MM-DD' },
        checkInPeriod: { type: 'string', enum: ['TOTAL', 'WEEKLY', 'MONTHLY'] },
        requireCheckInNote: { type: 'boolean' },
        trackingKeyword: { type: 'string' },
        accountName: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    type: 'function' as const,
    name: 'set_goal_status',
    description: '把目標標記為完成（COMPLETED）、放棄（ABANDONED）或重新開始（ACTIVE）。',
    parameters: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'ABANDONED'] },
      },
      required: ['goalId', 'status'],
    },
  },
];

/** Executes the 人生目標 tools above. Every write goes through
 * `LifeGoalsService`, so the App's validation rules (required check-in
 * note, auto-tracked goals can't be hand-edited, account ownership) apply
 * exactly the same when the change comes from LINE. */
@Injectable()
export class LifeGoalAiService {
  constructor(private readonly goals: LifeGoalsService) {}

  static readonly toolNames = new Set(LIFE_GOAL_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'list_life_goals': {
        const goals = await this.goals.listAll(userId, LifeGoalStatus.ACTIVE);
        return goals.map((g) => ({
          id: g.id,
          title: g.title,
          category: g.category,
          trackingType: TRACKING_LABEL[g.trackingType],
          checkInPeriod: g.trackingType === LifeGoalTrackingType.CHECK_IN ? g.checkInPeriod : undefined,
          requireCheckInNote: g.requireCheckInNote,
          currentValue: g.currentValue,
          targetValue: g.targetValue,
          startValue: g.startValue,
          unit: g.unit,
          targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null,
        }));
      }
      case 'set_goal_value': {
        const goal = await this.goals.getOne(userId, String(args.goalId));
        if (goal.trackingType !== LifeGoalTrackingType.MANUAL) {
          throw new Error('這個目標是自動追蹤的，數字不能手動改');
        }
        const updated = await this.goals.update(userId, goal.id, { currentValue: Number(args.value) });
        return { title: updated.title, currentValue: updated.currentValue, targetValue: updated.targetValue, unit: updated.unit };
      }
      case 'add_check_in': {
        const goalId = String(args.goalId);
        await this.goals.addCheckIn(userId, goalId, {
          title: args.title as string | undefined,
          note: args.note as string | undefined,
          value: args.value as number | undefined,
          date: args.date as string | undefined,
        });
        const goal = await this.goals.getOne(userId, goalId);
        return { title: goal.title, currentValue: goal.currentValue, targetValue: goal.targetValue, unit: goal.unit, period: goal.checkInPeriod };
      }
      case 'create_goal': {
        const trackingType = (args.trackingType as LifeGoalTrackingType | undefined) ?? LifeGoalTrackingType.MANUAL;
        let trackingAccountId: string | undefined;
        if (trackingType === LifeGoalTrackingType.ACCOUNT_BALANCE) {
          const { accounts } = await this.goals.trackingOptions(userId);
          const wanted = String(args.accountName ?? '');
          const match = accounts.find((a) => a.name === wanted) ?? accounts.find((a) => a.name.includes(wanted) || wanted.includes(a.name));
          if (!match) throw new Error(`找不到帳戶「${wanted}」，現有帳戶：${accounts.map((a) => a.name).join('、')}`);
          trackingAccountId = match.id;
        }
        const created = await this.goals.create(userId, {
          title: String(args.title),
          category: args.category as string | undefined,
          trackingType,
          targetValue: args.targetValue as number | undefined,
          currentValue: args.currentValue as number | undefined,
          unit: args.unit as string | undefined,
          targetDate: args.targetDate as string | undefined,
          checkInPeriod: args.checkInPeriod as LifeGoalPeriod | undefined,
          requireCheckInNote: args.requireCheckInNote as boolean | undefined,
          trackingKeyword: args.trackingKeyword as string | undefined,
          trackingAccountId,
        });
        return { id: created.id, title: created.title, trackingType: TRACKING_LABEL[created.trackingType], currentValue: created.currentValue, targetValue: created.targetValue };
      }
      case 'set_goal_status': {
        const updated = await this.goals.update(userId, String(args.goalId), { status: args.status as LifeGoalStatus });
        return { title: updated.title, status: updated.status };
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }
}
