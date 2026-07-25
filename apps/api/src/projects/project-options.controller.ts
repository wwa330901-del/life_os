import { Controller, Get, UseGuards } from '@nestjs/common';
import { ProjectOptionsService } from './project-options.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Read-only — any logged-in user needs these to populate the 類型/狀態
 * dropdowns when creating or editing a project. Managing the lists
 * themselves is platform-admin-only, see `AdminProjectOptionsController`. */
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
