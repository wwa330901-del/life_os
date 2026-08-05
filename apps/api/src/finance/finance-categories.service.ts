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
  { name: '股票買', kind: FinanceCategoryKind.EXPENSE },
  { name: '薪資', kind: FinanceCategoryKind.INCOME },
  { name: '其他收入', kind: FinanceCategoryKind.INCOME },
  { name: '股票賣', kind: FinanceCategoryKind.INCOME },
];

/** 股票交割入帳自動套用的兩個分類名稱 — `StocksSettlementService` 用
 * `findOrCreateSystemCategory` 查這兩個名字（見該方法註解）。集中定義在
 * 這裡，不要在別的地方另外寫死字串。 */
export const STOCK_BUY_CATEGORY_NAME = '股票買';
export const STOCK_SELL_CATEGORY_NAME = '股票賣';

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

    if (existing.length === 0) {
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

    // Self-heal (2026-08-06): 股票買/股票賣 was added to DEFAULT_CATEGORIES
    // after plenty of spaces already had their one-time seed above run, so
    // they never got it — findOrCreateSystemCategory only backfills a space
    // lazily, at its first actual stock settlement, so until then it's
    // simply missing from the category list/picker. Top up here too so an
    // existing account sees it immediately, not just after its next trade.
    const missing = DEFAULT_CATEGORIES.filter(
      (c) =>
        (c.name === STOCK_BUY_CATEGORY_NAME || c.name === STOCK_SELL_CATEGORY_NAME) &&
        !existing.some((e) => e.name === c.name && e.kind === c.kind),
    );
    if (missing.length === 0) return existing;

    const maxSortOrder = await this.prisma.financeCategory.aggregate({
      where: { spaceId },
      _max: { sortOrder: true },
    });
    await this.prisma.financeCategory.createMany({
      data: missing.map((c, index) => ({
        spaceId,
        name: c.name,
        kind: c.kind,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 + index,
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

  /** Used by `StocksSettlementService` so every 股票買/股票賣 交割入帳 always
   * lands in the right category, regardless of whether this space is
   * brand new (already seeded via `DEFAULT_CATEGORIES`) or predates this
   * feature (missing it — self-heals here instead of needing a one-off
   * backfill migration). Top-level only (no parent) — matches how the
   * rest of `DEFAULT_CATEGORIES` is seeded. Internal — not exposed over
   * HTTP, callers never pick a name/kind combination the user didn't ask
   * for. */
  async findOrCreateSystemCategory(spaceId: string, name: string, kind: FinanceCategoryKind) {
    const existing = await this.prisma.financeCategory.findFirst({ where: { spaceId, name, kind } });
    if (existing) return existing;

    const maxSortOrder = await this.prisma.financeCategory.aggregate({
      where: { spaceId },
      _max: { sortOrder: true },
    });
    return this.prisma.financeCategory.create({
      data: { spaceId, name, kind, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 },
    });
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
