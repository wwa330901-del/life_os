import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { FieldChangeLogService } from './field-change-log.service';
import { ProjectsService } from '../projects/projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { FieldChangeEntityType } from '../../generated/prisma/client.js';

/** Read-only — "頁面歷史紀錄可查" (顧問文件). Scoped through the owning
 * project the same way every other engineering-finance sub-resource is,
 * even though FieldChangeLog itself is keyed by spaceId (a project's
 * access check is stricter than a bare space check when the caller is a
 * regular MEMBER, not just OWNER/ADMIN). */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/field-change-log')
export class FieldChangeLogController {
  constructor(
    private readonly fieldChangeLogService: FieldChangeLogService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('entityType') entityType: FieldChangeEntityType,
    @Query('entityId') entityId: string,
  ) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(user.id, project);
    return this.fieldChangeLogService.list(
      project.spaceId,
      entityType,
      entityId,
    );
  }
}
