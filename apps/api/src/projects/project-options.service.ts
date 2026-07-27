import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only access to the legacy platform-wide "類型"/"狀態" option lists
 * (`Project.typeId`/`statusId`, a stage-1 safety net predating each space's
 * own custom-property system — see `ProjectPropertiesService`). Management
 * (create/rename/delete) was removed 2026-07-27 along with the platform-admin
 * "專案類型/狀態管理" screen, since every space now defines its own 類型/狀態
 * as per-space properties instead. Left read-only in case any project still
 * carries an old `typeId`/`statusId` value that needs to resolve to a label.
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
}
