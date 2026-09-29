import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LifeGoalStatus, LifeGoalTrackingType } from '../../generated/prisma/client.js';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';
import { CreateLifeGoalDto } from './dto/create-life-goal.dto';
import { UpdateLifeGoalDto } from './dto/update-life-goal.dto';
import { CreateLifeGoalCheckInDto } from './dto/create-life-goal-check-in.dto';
import { LifeGoalProgressService } from './life-goal-progress.service';

/** Auto-tracked types that only make sense with a target to measure against. */
const NEEDS_TARGET: LifeGoalTrackingType[] = [
  LifeGoalTrackingType.ACCOUNT_BALANCE,
  LifeGoalTrackingType.NET_WORTH,
  LifeGoalTrackingType.NOTE_KEYWORD_SUM,
  LifeGoalTrackingType.STOCK_VALUE,
];

/** 人生目標 — account-level like 知識庫/個人代辦事項, not scoped to any
 * Space. See schema.prisma's doc comments on `LifeGoal` and
 * `LifeGoalTrackingType`. Every read goes through
 * `LifeGoalProgressService.resolve` so auto-tracked numbers are live. */
@Injectable()
export class LifeGoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: LifeGoalProgressService,
  ) {}

  async listAll(userId: string, status?: LifeGoalStatus) {
    const goals = await this.prisma.lifeGoal.findMany({
      where: { ownerUserId: userId, ...(status && { status }) },
      orderBy: [{ status: 'asc' }, { targetDate: 'asc' }, { sortOrder: 'asc' }],
    });
    return this.progress.resolve(userId, goals);
  }

  async getOne(userId: string, id: string) {
    const goal = await this.getAuthorizedGoal(userId, id);
    const [resolved] = await this.progress.resolve(userId, [goal]);
    return resolved;
  }

  /** What the editor's 追蹤方式 pickers need — the user's own 記帳 accounts. */
  async trackingOptions(userId: string) {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    const accounts = space
      ? await this.prisma.financeAccount.findMany({
          where: { spaceId: space.id },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        })
      : [];
    return { accounts };
  }

  async create(userId: string, dto: CreateLifeGoalDto) {
    const trackingType = dto.trackingType ?? LifeGoalTrackingType.MANUAL;
    await this.validateTracking(userId, {
      trackingType,
      targetValue: dto.targetValue ?? null,
      trackingAccountId: dto.trackingAccountId ?? null,
      trackingKeyword: dto.trackingKeyword ?? null,
    });

    const goal = await this.prisma.lifeGoal.create({
      data: {
        ownerUserId: userId,
        title: dto.title,
        notes: dto.notes,
        category: dto.category,
        targetValue: dto.targetValue,
        currentValue: dto.currentValue ?? 0,
        startValue:
          dto.startValue ?? (trackingType === LifeGoalTrackingType.MANUAL ? (dto.currentValue ?? 0) : null),
        unit: dto.unit,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        trackingType,
        trackingAccountId: trackingType === LifeGoalTrackingType.ACCOUNT_BALANCE ? dto.trackingAccountId : null,
        trackingKeyword: trackingType === LifeGoalTrackingType.NOTE_KEYWORD_SUM ? dto.trackingKeyword : null,
        checkInPeriod: dto.checkInPeriod,
        requireCheckInNote: dto.requireCheckInNote ?? false,
        progressUpdatedAt: new Date(),
        sortOrder: await this.nextSortOrder(userId),
      },
    });
    return this.getOne(userId, goal.id);
  }

  async update(userId: string, id: string, dto: UpdateLifeGoalDto) {
    const existing = await this.getAuthorizedGoal(userId, id);

    const trackingType = dto.trackingType ?? existing.trackingType;
    const merged = {
      trackingType,
      targetValue: dto.targetValue !== undefined ? dto.targetValue : existing.targetValue,
      trackingAccountId: dto.trackingAccountId !== undefined ? dto.trackingAccountId : existing.trackingAccountId,
      trackingKeyword: dto.trackingKeyword !== undefined ? dto.trackingKeyword : existing.trackingKeyword,
    };
    await this.validateTracking(userId, merged);

    const justCompleted = dto.status === LifeGoalStatus.COMPLETED && existing.status !== LifeGoalStatus.COMPLETED;
    const reopened = dto.status !== undefined && dto.status !== LifeGoalStatus.COMPLETED && existing.status === LifeGoalStatus.COMPLETED;
    const progressMoved = dto.currentValue !== undefined && dto.currentValue !== existing.currentValue;

    await this.prisma.lifeGoal.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
        ...(dto.currentValue !== undefined && { currentValue: dto.currentValue }),
        ...(dto.startValue !== undefined && { startValue: dto.startValue }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.targetDate !== undefined && {
          targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
        trackingType,
        trackingAccountId: trackingType === LifeGoalTrackingType.ACCOUNT_BALANCE ? merged.trackingAccountId : null,
        trackingKeyword: trackingType === LifeGoalTrackingType.NOTE_KEYWORD_SUM ? merged.trackingKeyword : null,
        ...(dto.checkInPeriod !== undefined && { checkInPeriod: dto.checkInPeriod }),
        ...(dto.requireCheckInNote !== undefined && { requireCheckInNote: dto.requireCheckInNote }),
        ...(progressMoved && { progressUpdatedAt: new Date(), staleRemindedAt: null }),
        ...(justCompleted && { completedAt: new Date() }),
        ...(reopened && { completedAt: null }),
      },
    });
    return this.getOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.getAuthorizedGoal(userId, id);
    await this.prisma.lifeGoal.delete({ where: { id } });
  }

  async listCheckIns(userId: string, goalId: string) {
    await this.getAuthorizedGoal(userId, goalId);
    return this.prisma.lifeGoalCheckIn.findMany({
      where: { goalId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addCheckIn(userId: string, goalId: string, dto: CreateLifeGoalCheckInDto) {
    const goal = await this.getAuthorizedGoal(userId, goalId);
    if (goal.trackingType !== LifeGoalTrackingType.CHECK_IN) {
      throw new BadRequestException('這個目標不是打卡型的');
    }
    const note = dto.note?.trim() || null;
    if (goal.requireCheckInNote && !note) {
      throw new BadRequestException('這個目標打卡要寫心得或最喜歡的一句話才算數');
    }

    const checkIn = await this.prisma.lifeGoalCheckIn.create({
      data: {
        goalId,
        date: dto.date ? new Date(dto.date) : taipeiDateKeyToUtcMidnight(taipeiDateKey(new Date())),
        value: dto.value ?? 1,
        title: dto.title?.trim() || null,
        note,
      },
    });
    await this.prisma.lifeGoal.update({
      where: { id: goalId },
      data: { progressUpdatedAt: new Date(), staleRemindedAt: null },
    });
    return checkIn;
  }

  async removeCheckIn(userId: string, checkInId: string) {
    const checkIn = await this.prisma.lifeGoalCheckIn.findUnique({ where: { id: checkInId } });
    if (!checkIn) throw new NotFoundException('打卡紀錄不存在');
    await this.getAuthorizedGoal(userId, checkIn.goalId);
    await this.prisma.lifeGoalCheckIn.delete({ where: { id: checkInId } });
  }

  private async validateTracking(
    userId: string,
    t: {
      trackingType: LifeGoalTrackingType;
      targetValue: number | null;
      trackingAccountId: string | null;
      trackingKeyword: string | null;
    },
  ) {
    if (NEEDS_TARGET.includes(t.trackingType) && (t.targetValue == null || t.targetValue <= 0)) {
      throw new BadRequestException('自動追蹤的目標要設定目標數值');
    }
    if (t.trackingType === LifeGoalTrackingType.NOTE_KEYWORD_SUM && !t.trackingKeyword?.trim()) {
      throw new BadRequestException('請輸入要追蹤的備註關鍵字');
    }
    if (t.trackingType === LifeGoalTrackingType.ACCOUNT_BALANCE) {
      if (!t.trackingAccountId) throw new BadRequestException('請選擇要追蹤的帳戶');
      const account = await this.prisma.financeAccount.findUnique({
        where: { id: t.trackingAccountId },
        include: { space: true },
      });
      if (!account || account.space.ownerUserId !== userId) {
        throw new BadRequestException('找不到這個帳戶');
      }
    }
  }

  private async nextSortOrder(userId: string) {
    const max = await this.prisma.lifeGoal.aggregate({
      where: { ownerUserId: userId },
      _max: { sortOrder: true },
    });
    return (max._max.sortOrder ?? -1) + 1;
  }

  private async getAuthorizedGoal(userId: string, id: string) {
    const goal = await this.prisma.lifeGoal.findUnique({ where: { id } });
    if (!goal) {
      throw new NotFoundException('人生目標不存在');
    }
    if (goal.ownerUserId !== userId) {
      throw new ForbiddenException('You do not have access to this goal');
    }
    return goal;
  }
}
