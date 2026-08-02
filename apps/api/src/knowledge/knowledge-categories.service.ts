import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateKnowledgeCategoryDto } from './dto/create-knowledge-category.dto';
import { UpdateKnowledgeCategoryDto } from './dto/update-knowledge-category.dto';
import {
  KnowledgeFieldDto,
  UpdateKnowledgeFieldDto,
} from './dto/knowledge-field.dto';
import {
  CategoryContext,
  KnowledgeFieldType,
} from './ai/ai-content-analysis.interface';
import { DEFAULT_CATEGORY_TEMPLATES } from './default-category-templates';

/** 知識庫 categories/fields — account-level, not scoped to any Space, and
 * each owner defines their own (same "each owner owns their own columns"
 * shape as ProjectPropertyDefinition, see schema.prisma). Sharing is at the
 * category granularity: `isPublic` + `blacklistedUserIds` control whether
 * OTHER accounts can see this category's items, never the owner's own view
 * of it (an owner always sees 100% of their own categories/items). */
@Injectable()
export class KnowledgeCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async listOwn(userId: string) {
    const categories = await this.prisma.knowledgeCategory.findMany({
      where: { ownerUserId: userId },
      include: {
        fields: { include: { options: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const allBlockedIds = [
      ...new Set(categories.flatMap((c) => c.blacklistedUserIds)),
    ];
    const blockedUsers = allBlockedIds.length
      ? await this.usersService.findManyByIds(allBlockedIds)
      : [];
    const blockedById = new Map(blockedUsers.map((u) => [u.id, u]));

    return categories.map((category) => ({
      ...category,
      blacklistedUsers: category.blacklistedUserIds
        .map((id) => blockedById.get(id))
        .filter((u): u is NonNullable<typeof u> => u !== undefined)
        .map((u) => ({ id: u.id, name: u.name, email: u.email })),
    }));
  }

  async addToBlacklist(userId: string, categoryId: string, email: string) {
    const category = await this.getOwnedOrThrow(userId, categoryId);
    const target = await this.usersService.findByEmail(email);
    if (!target) throw new NotFoundException('找不到這個 email 對應的帳號');
    if (target.id === userId) throw new BadRequestException('不能封鎖自己');
    if (category.blacklistedUserIds.includes(target.id)) return category;

    return this.prisma.knowledgeCategory.update({
      where: { id: categoryId },
      data: { blacklistedUserIds: [...category.blacklistedUserIds, target.id] },
    });
  }

  async removeFromBlacklist(
    userId: string,
    categoryId: string,
    blockedUserId: string,
  ) {
    const category = await this.getOwnedOrThrow(userId, categoryId);
    return this.prisma.knowledgeCategory.update({
      where: { id: categoryId },
      data: {
        blacklistedUserIds: category.blacklistedUserIds.filter(
          (id) => id !== blockedUserId,
        ),
      },
    });
  }

  /** Other users' public categories the caller isn't blacklisted from — for
   * the App's 公開區. */
  async listPublicFromOthers(viewerUserId: string) {
    const categories = await this.prisma.knowledgeCategory.findMany({
      where: { isPublic: true, ownerUserId: { not: viewerUserId } },
      include: {
        fields: { include: { options: true }, orderBy: { sortOrder: 'asc' } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return categories.filter(
      (category) => !category.blacklistedUserIds.includes(viewerUserId),
    );
  }

  async create(userId: string, dto: CreateKnowledgeCategoryDto) {
    await this.assertNameAvailable(userId, dto.name);
    return this.prisma.knowledgeCategory.create({
      data: {
        ownerUserId: userId,
        name: dto.name,
        isPublic: dto.isPublic ?? false,
        fields: {
          create: (dto.fields ?? []).map((field, index) => ({
            name: field.name,
            type: field.type,
            sortOrder: index,
          })),
        },
      },
      include: {
        fields: { include: { options: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  /** Used by the LINE flow when the user replies "新增" to an AI-suggested
   * new category. */
  async createFromSuggestion(
    userId: string,
    name: string,
    fields: { name: string; type: KnowledgeFieldType }[],
  ) {
    // A suggested name colliding with an existing one just reuses it rather
    // than erroring — the AI already couldn't match it to that category by
    // content, but a same-name collision means the user's reply is really
    // "yes, that one", handled the same as findByNameOrThrow would.
    const existing = await this.prisma.knowledgeCategory.findUnique({
      where: { ownerUserId_name: { ownerUserId: userId, name } },
    });
    if (existing) return existing;

    return this.prisma.knowledgeCategory.create({
      data: {
        ownerUserId: userId,
        name,
        fields: {
          create: fields.map((field, index) => ({
            name: field.name,
            type: field.type,
            sortOrder: index,
          })),
        },
      },
      include: { fields: true },
    });
  }

  /** "一鍵套用建議分類" — opt-in only (a button the user presses), never
   * run automatically for a new account. Idempotent: skips any template
   * whose name the user already has (their own category, if one exists,
   * wins untouched — this never overwrites/duplicates). */
  async seedDefaults(userId: string): Promise<number> {
    const existingNames = new Set(
      (
        await this.prisma.knowledgeCategory.findMany({
          where: { ownerUserId: userId },
          select: { name: true },
        })
      ).map((c) => c.name),
    );

    const toCreate = DEFAULT_CATEGORY_TEMPLATES.filter(
      (template) => !existingNames.has(template.name),
    );
    for (const template of toCreate) {
      await this.prisma.knowledgeCategory.create({
        data: {
          ownerUserId: userId,
          name: template.name,
          fields: {
            create: template.fields.map((field, index) => ({
              name: field.name,
              type: field.type,
              sortOrder: index,
            })),
          },
        },
      });
    }
    return toCreate.length;
  }

  async findByNameForUser(userId: string, name: string) {
    return this.prisma.knowledgeCategory.findUnique({
      where: { ownerUserId_name: { ownerUserId: userId, name } },
      include: { fields: true },
    });
  }

  async update(
    userId: string,
    categoryId: string,
    dto: UpdateKnowledgeCategoryDto,
  ) {
    const category = await this.getOwnedOrThrow(userId, categoryId);
    if (dto.name && dto.name !== category.name) {
      await this.assertNameAvailable(userId, dto.name);
    }
    return this.prisma.knowledgeCategory.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        isPublic: dto.isPublic,
        blacklistedUserIds: dto.blacklistedUserIds,
      },
    });
  }

  async remove(userId: string, categoryId: string) {
    await this.getOwnedOrThrow(userId, categoryId);
    await this.prisma.knowledgeCategory.delete({ where: { id: categoryId } });
  }

  async addField(userId: string, categoryId: string, dto: KnowledgeFieldDto) {
    await this.getOwnedOrThrow(userId, categoryId);
    const maxSortOrder = await this.prisma.knowledgeFieldDefinition.aggregate({
      where: { categoryId },
      _max: { sortOrder: true },
    });
    return this.prisma.knowledgeFieldDefinition.create({
      data: {
        categoryId,
        name: dto.name,
        type: dto.type,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async renameField(
    userId: string,
    categoryId: string,
    fieldId: string,
    dto: UpdateKnowledgeFieldDto,
  ) {
    await this.getOwnedOrThrow(userId, categoryId);
    await this.getFieldOrThrow(categoryId, fieldId);
    return this.prisma.knowledgeFieldDefinition.update({
      where: { id: fieldId },
      data: { name: dto.name },
    });
  }

  async removeField(userId: string, categoryId: string, fieldId: string) {
    await this.getOwnedOrThrow(userId, categoryId);
    await this.getFieldOrThrow(categoryId, fieldId);
    await this.prisma.knowledgeFieldDefinition.delete({
      where: { id: fieldId },
    });
  }

  /** Find-or-create a SELECT option by label — used both from the App
   * (manual option management) and from KnowledgeItemsService when the AI
   * returns a value for a SELECT field that doesn't have a matching option
   * yet (the field-set is meant to grow on its own, same as categories). */
  async resolveSelectOptionId(fieldId: string, label: string): Promise<string> {
    const existing = await this.prisma.knowledgeFieldOption.findFirst({
      where: { definitionId: fieldId, label },
    });
    if (existing) return existing.id;

    const maxSortOrder = await this.prisma.knowledgeFieldOption.aggregate({
      where: { definitionId: fieldId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.knowledgeFieldOption.create({
      data: {
        definitionId: fieldId,
        label,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
    return created.id;
  }

  /** The shape the AI content-analysis service needs: just names+types, no
   * ownership/audit columns. */
  async getCategoriesForAi(userId: string): Promise<CategoryContext[]> {
    const categories = await this.listOwn(userId);
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      fields: category.fields.map((field) => ({
        name: field.name,
        type: field.type,
      })),
    }));
  }

  async getOwnedOrThrow(userId: string, categoryId: string) {
    const category = await this.prisma.knowledgeCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.ownerUserId !== userId) {
      throw new NotFoundException('Knowledge category not found');
    }
    return category;
  }

  private async getFieldOrThrow(categoryId: string, fieldId: string) {
    const field = await this.prisma.knowledgeFieldDefinition.findUnique({
      where: { id: fieldId },
    });
    if (!field || field.categoryId !== categoryId) {
      throw new NotFoundException('Knowledge field not found');
    }
    return field;
  }

  private async assertNameAvailable(userId: string, name: string) {
    const existing = await this.prisma.knowledgeCategory.findUnique({
      where: { ownerUserId_name: { ownerUserId: userId, name } },
    });
    if (existing) {
      throw new ForbiddenException('已經有一個同名的知識庫分類了');
    }
  }
}
