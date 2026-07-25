import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { MembershipRole, PropertyType } from '../../generated/prisma/client.js';
import { CreatePropertyDefinitionDto, RenamePropertyDefinitionDto } from './dto/property-definition.dto';
import { PropertyOptionDto } from './dto/property-option.dto';

/**
 * Each company space defines its own project properties — Notion-
 * database-style (文字/單選/數字/日期). Unlike the platform-wide
 * ProjectTypeOption/ProjectStatusOption this replaces, managing these is
 * gated to the *space's own* OWNER/ADMIN, not a platform admin — this is
 * the space's own configuration, not a platform-wide setting.
 */
@Injectable()
export class ProjectPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    return this.prisma.projectPropertyDefinition.findMany({
      where: { spaceId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreatePropertyDefinitionDto) {
    await this.assertCanManage(userId, spaceId);
    const maxSortOrder = await this.prisma.projectPropertyDefinition.aggregate({
      where: { spaceId },
      _max: { sortOrder: true },
    });
    return this.prisma.projectPropertyDefinition.create({
      data: {
        spaceId,
        name: dto.name,
        type: dto.type as PropertyType,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
      include: { options: true },
    });
  }

  async rename(
    userId: string,
    spaceId: string,
    definitionId: string,
    dto: RenamePropertyDefinitionDto,
  ) {
    await this.assertCanManage(userId, spaceId);
    await this.getDefinitionOrThrow(spaceId, definitionId);
    return this.prisma.projectPropertyDefinition.update({
      where: { id: definitionId },
      data: { name: dto.name },
    });
  }

  async remove(userId: string, spaceId: string, definitionId: string) {
    await this.assertCanManage(userId, spaceId);
    await this.getDefinitionOrThrow(spaceId, definitionId);
    // Cascades to its options and every project's value for it — dropping
    // a property is the space's own call, not something that needs the
    // "can't delete while in use" guard the platform-wide type/status
    // options have.
    await this.prisma.projectPropertyDefinition.delete({ where: { id: definitionId } });
  }

  async addOption(userId: string, spaceId: string, definitionId: string, dto: PropertyOptionDto) {
    await this.assertCanManage(userId, spaceId);
    const definition = await this.getDefinitionOrThrow(spaceId, definitionId);
    if (definition.type !== PropertyType.SELECT) {
      throw new BadRequestException('只有單選屬性可以設定選項');
    }
    const maxSortOrder = await this.prisma.projectPropertyOption.aggregate({
      where: { definitionId },
      _max: { sortOrder: true },
    });
    return this.prisma.projectPropertyOption.create({
      data: { definitionId, label: dto.label, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 },
    });
  }

  async renameOption(
    userId: string,
    spaceId: string,
    definitionId: string,
    optionId: string,
    dto: PropertyOptionDto,
  ) {
    await this.assertCanManage(userId, spaceId);
    await this.getDefinitionOrThrow(spaceId, definitionId);
    await this.getOptionOrThrow(definitionId, optionId);
    return this.prisma.projectPropertyOption.update({
      where: { id: optionId },
      data: { label: dto.label },
    });
  }

  async removeOption(userId: string, spaceId: string, definitionId: string, optionId: string) {
    await this.assertCanManage(userId, spaceId);
    await this.getDefinitionOrThrow(spaceId, definitionId);
    await this.getOptionOrThrow(definitionId, optionId);
    // onDelete: SetNull on ProjectPropertyValue.optionId — a project that
    // had this option just goes back to "unset" for this property, not
    // deleted outright.
    await this.prisma.projectPropertyOption.delete({ where: { id: optionId } });
  }

  private async assertCanManage(userId: string, spaceId: string): Promise<void> {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    if (space.role !== MembershipRole.OWNER && space.role !== MembershipRole.ADMIN) {
      throw new ForbiddenException('只有空間擁有者或管理員可以設定專案屬性');
    }
  }

  private async getDefinitionOrThrow(spaceId: string, definitionId: string) {
    const definition = await this.prisma.projectPropertyDefinition.findUnique({
      where: { id: definitionId },
    });
    if (!definition || definition.spaceId !== spaceId) {
      throw new NotFoundException('Property definition not found');
    }
    return definition;
  }

  private async getOptionOrThrow(definitionId: string, optionId: string) {
    const option = await this.prisma.projectPropertyOption.findUnique({ where: { id: optionId } });
    if (!option || option.definitionId !== definitionId) {
      throw new NotFoundException('Property option not found');
    }
    return option;
  }
}
