import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LifeGoalStatus } from '../../generated/prisma/client.js';
import { CreateLifeGoalDto } from './dto/create-life-goal.dto';
import { UpdateLifeGoalDto } from './dto/update-life-goal.dto';

/** 人生目標 — account-level like 知識庫/個人代辦事項, not scoped to any
 * Space. See schema.prisma's doc comment on `LifeGoal` for the
 * targetValue/currentValue/unit shape. */
@Injectable()
export class LifeGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(userId: string, status?: LifeGoalStatus) {
    return this.prisma.lifeGoal.findMany({
      where: { ownerUserId: userId, ...(status && { status }) },
      orderBy: [{ status: 'asc' }, { targetDate: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateLifeGoalDto) {
    return this.prisma.lifeGoal.create({
      data: {
        ownerUserId: userId,
        title: dto.title,
        notes: dto.notes,
        category: dto.category,
        targetValue: dto.targetValue,
        currentValue: dto.currentValue ?? 0,
        unit: dto.unit,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        sortOrder: await this.nextSortOrder(userId),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateLifeGoalDto) {
    const existing = await this.getAuthorizedGoal(userId, id);

    const justCompleted = dto.status === LifeGoalStatus.COMPLETED && existing.status !== LifeGoalStatus.COMPLETED;
    const reopened = dto.status !== undefined && dto.status !== LifeGoalStatus.COMPLETED && existing.status === LifeGoalStatus.COMPLETED;

    return this.prisma.lifeGoal.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
        ...(dto.currentValue !== undefined && { currentValue: dto.currentValue }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.targetDate !== undefined && {
          targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(justCompleted && { completedAt: new Date() }),
        ...(reopened && { completedAt: null }),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.getAuthorizedGoal(userId, id);
    await this.prisma.lifeGoal.delete({ where: { id } });
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
