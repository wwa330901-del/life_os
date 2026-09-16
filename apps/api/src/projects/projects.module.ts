import { Module } from '@nestjs/common';
import { SpaceProjectsController } from './space-projects.controller';
import { ProjectsController } from './projects.controller';
import { WorkItemsController } from './work-items.controller';
import { ProjectMembersController } from './project-members.controller';
import { ProjectPropertiesController } from './project-properties.controller';
import { DailyReportsController } from './daily-reports.controller';
import { SpaceDailyReportsController } from './space-daily-reports.controller';
import { WeeklyReportsController } from './weekly-reports.controller';
import { SpaceWeeklyReportsController } from './space-weekly-reports.controller';
import { ContactRecordsController } from './contact-records.controller';
import { ExecutionPhotosController } from './execution-photos.controller';
import { ProjectsService } from './projects.service';
import { WorkItemsService } from './work-items.service';
import { ScheduleService } from './schedule.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectPropertiesService } from './project-properties.service';
import { DailyReportsService } from './daily-reports.service';
import { WeeklyReportsService } from './weekly-reports.service';
import { ContactRecordsService } from './contact-records.service';
import { ExecutionPhotosService } from './execution-photos.service';
import { SpacesModule } from '../spaces/spaces.module';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ClientsModule } from '../clients/clients.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [
    SpacesModule,
    UsersModule,
    PermissionsModule,
    ClientsModule,
    KnowledgeModule,
  ],
  controllers: [
    SpaceProjectsController,
    ProjectsController,
    WorkItemsController,
    ProjectMembersController,
    ProjectPropertiesController,
    DailyReportsController,
    SpaceDailyReportsController,
    WeeklyReportsController,
    SpaceWeeklyReportsController,
    ContactRecordsController,
    ExecutionPhotosController,
  ],
  providers: [
    ProjectsService,
    WorkItemsService,
    ScheduleService,
    ProjectMembersService,
    ProjectPropertiesService,
    DailyReportsService,
    WeeklyReportsService,
    ContactRecordsService,
    ExecutionPhotosService,
  ],
  exports: [
    ProjectsService,
    ScheduleService,
    DailyReportsService,
    WeeklyReportsService,
  ],
})
export class ProjectsModule {}
