import { Controller, Get, UseGuards } from '@nestjs/common';
import { ProjectOptionsService } from './project-options.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Read-only legacy lookup — kept only so an old `typeId`/`statusId` on a
 * `Project` row still resolves to a label; see `ProjectOptionsService`. */
@UseGuards(JwtAuthGuard)
@Controller('project-options')
export class ProjectOptionsController {
  constructor(private readonly projectOptionsService: ProjectOptionsService) {}

  @Get('types')
  listTypes() {
    return this.projectOptionsService.listTypes();
  }

  @Get('statuses')
  listStatuses() {
    return this.projectOptionsService.listStatuses();
  }
}
