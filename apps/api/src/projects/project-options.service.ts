import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The "類型"/"狀態" dropdown option lists a project's create/edit form
 * picks from — platform-wide (managed by a platform admin under
 * `isPlatformAdmin`, not per-space) since the user described these as
 * admin-configured, Notion-database-style select properties, not
 * something each company space customizes on its own.
 */
@Injectable()
export class ProjectOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  listTypes() {
    return this.prisma.projectTypeOption.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  listStatuses() {
    return this.prisma.projectStatusOption.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createType(label: string) {
    const maxSortOrder = await this.prisma.projectTypeOption.aggregate({ _max: { sortOrder: true } });
    return this.prisma.projectTypeOption.create({
      data: { label, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 },
    });
  }

  async createStatus(label: string) {
    const maxSortOrder = await this.prisma.projectStatusOption.aggregate({ _max: { sortOrder: true } });
    return this.prisma.projectStatusOption.create({
      data: { label, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 },
    });
  }

  async renameType(id: string, label: string) {
    await this.getTypeOrThrow(id);
    return this.prisma.projectTypeOption.update({ where: { id }, data: { label } });
  }

  async renameStatus(id: string, label: string) {
    await this.getStatusOrThrow(id);
    return this.prisma.projectStatusOption.update({ where: { id }, data: { label } });
  }

  async deleteType(id: string) {
    await this.getTypeOrThrow(id);
    const inUse = await this.prisma.project.count({ where: { typeId: id } });
    if (inUse > 0) {
      throw new BadRequestException('還有專案在使用這個類型，無法刪除');
    }
    await this.prisma.projectTypeOption.delete({ where: { id } });
  }

  async deleteStatus(id: string) {
    await this.getStatusOrThrow(id);
    const inUse = await this.prisma.project.count({ where: { statusId: id } });
    if (inUse > 0) {
      throw new BadRequestException('還有專案在使用這個狀態，無法刪除');
    }
    await this.prisma.projectStatusOption.delete({ where: { id } });
  }

  private async getTypeOrThrow(id: string) {
    const option = await this.prisma.projectTypeOption.findUnique({ where: { id } });
    if (!option) throw new NotFoundException('Project type option not found');
    return option;
  }

  private async getStatusOrThrow(id: string) {
    const option = await this.prisma.projectStatusOption.findUnique({ where: { id } });
    if (!option) throw new NotFoundException('Project status option not found');
    return option;
  }
}
