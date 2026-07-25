import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ScheduleService } from './schedule.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly scheduleService: ScheduleService,
  ) {}

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.getOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.remove(user.id, id);
  }

  @Patch(':id/calendar')
  updateCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarDto,
  ) {
    return this.projectsService.updateCalendar(user.id, id, dto);
  }

  @Get(':id/schedule')
  getSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.scheduleService.getSchedule(user.id, id);
  }

  /**
   * Project + work items + computed schedule together — what the schedule
   * tab actually needs after every edit. See `ScheduleService.getEditorState`
   * for why this exists instead of three separate GETs.
   */
  @Get(':id/editor-state')
  getEditorState(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.scheduleService.getEditorState(user.id, id);
  }
}
