import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceCategoryKind } from '../../generated/prisma/client.js';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';

const DEFAULT_CATEGORIES: { name: string; kind: FinanceCategoryKind }[] = [
  { name: '餐飲', kind: FinanceCategoryKind.EXPENSE },
  { name: '交通', kind: FinanceCategoryKind.EXPENSE },
  { name: '購物', kind: FinanceCategoryKind.EXPENSE },
  { name: '娛樂', kind: FinanceCategoryKind.EXPENSE },
  { name: '居住', kind: FinanceCategoryKind.EXPENSE },
  { name: '醫療', kind: FinanceCategoryKind.EXPENSE },
  { name: '其他支出', kind: FinanceCategoryKind.EXPENSE },
  { name: '薪資', kind: FinanceCategoryKind.INCOME },
  { name: '其他收入', kind: FinanceCategoryKind.INCOME },
];

/** 母分類/子分類 — exactly two levels, enforced here (not in the DB):
 * a category may only be set as someone's parent if it has no parent of
 * its own, and a category with children of its own can't be re-parented
 * under something else (that would make a 3-level chain). */
@Injectable()
export class FinanceCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
  ) {}

  /** Lazily seeds the standard starter categories the first time a
   * personal space's 記帳 module is opened, rather than at account
   * registration (most users may never touch this feature). Every seeded
   * row is fully user-editable/deletable afterward, same as one the user
   * adds themselves — there's no "system category" distinction. All seeded
   * as 母分類 with no children; the user adds 子分類 themselves. */
  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const existing = await this.prisma.financeCategory.findMany({
      where: { spaceId },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length > 0) return existing;

    await this.prisma.financeCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c, index) => ({
        spaceId,
        name: c.name,
        kind: c.kind,
        sortOrder: index,
      })),
    });
    return this.prisma.financeCategory.findMany({
      where: { spaceId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateFinanceCategoryDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    if (dto.parentId) {
      await this.assertUsableAsParent(spaceId, dto.parentId, dto.kind);
    }
    const maxSortOrder = await this.prisma.financeCategory.aggregate({
      where: { spaceId },
      _max: { sortOrder: true },
    });
    return this.prisma.financeCategory.create({
      data: {
        spaceId,
        name: dto.name,
        kind: dto.kind,
        parentId: dto.parentId,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async update(userId: string, spaceId: string, id: string, dto: UpdateFinanceCategoryDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const existing = await this.getOrThrow(spaceId, id);

    if (dto.parentId !== undefined && dto.parentId !== existing.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('分類不能是自己的母分類');
      }
      if (dto.parentId) {
        await this.assertUsableAsParent(spaceId, dto.parentId, existing.kind);
        const childCount = await this.prisma.financeCategory.count({ where: { parentId: id } });
        if (childCount > 0) {
          throw new BadRequestException('這個分類底下已經有子分類，不能再變成別人的子分類（最多兩層）');
        }
      }
    }

    return this.prisma.financeCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
    });
  }

  /** Deleting a category leaves its past transactions intact
   * (categoryId → SetNull) — they just show up as "未分類" afterward
   * instead of disappearing. Deleting a 母分類 cascades to its 子分類
   * (schema-level onDelete: Cascade on the self-relation) — their past
   * transactions become 未分類 too. */
  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, id);
    await this.prisma.financeCategory.delete({ where: { id } });
  }

  private async assertUsableAsParent(spaceId: string, parentId: string, kind: FinanceCategoryKind) {
    const parent = await this.prisma.financeCategory.findUnique({ where: { id: parentId } });
    if (!parent || parent.spaceId !== spaceId) {
      throw new NotFoundException('母分類不存在');
    }
    if (parent.kind !== kind) {
      throw new BadRequestException('子分類的收支類型必須跟母分類一致');
    }
    if (parent.parentId !== null) {
      throw new BadRequestException('母分類本身不能是別人的子分類（最多兩層）');
    }
  }

  private async getOrThrow(spaceId: string, id: string) {
    const category = await this.prisma.financeCategory.findUnique({ where: { id } });
    if (!category || category.spaceId !== spaceId) {
      throw new NotFoundException('Finance category not found');
    }
    return category;
  }
}
