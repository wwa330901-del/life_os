import { Module } from '@nestjs/common';
import { SpaceProjectsController } from './space-projects.controller';
import { ProjectsController } from './projects.controller';
import { WorkItemsController } from './work-items.controller';
import { ProjectMembersController } from './project-members.controller';
import { ProjectPropertiesController } from './project-properties.controller';
import { DailyReportsController } from './daily-reports.controller';
import { SpaceDailyReportsController } from './space-daily-reports.controller';
import { ProjectsService } from './projects.service';
import { WorkItemsService } from './work-items.service';
import { ScheduleService } from './schedule.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectPropertiesService } from './project-properties.service';
import { DailyReportsService } from './daily-reports.service';
import { SpacesModule } from '../spaces/spaces.module';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [SpacesModule, UsersModule, PermissionsModule, ClientsModule],
  controllers: [
    SpaceProjectsController,
    ProjectsController,
    WorkItemsController,
    ProjectMembersController,
    ProjectPropertiesController,
    DailyReportsController,
    SpaceDailyReportsController,
  ],
  providers: [
    ProjectsService,
    WorkItemsService,
    ScheduleService,
    ProjectMembersService,
    ProjectPropertiesService,
    DailyReportsService,
  ],
  exports: [ProjectsService, ScheduleService, DailyReportsService],
})
export class ProjectsModule {}
