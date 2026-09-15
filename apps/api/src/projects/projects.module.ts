import { Module } from '@nestjs/common';
import { SpaceProjectsController } from './space-projects.controller';
import { ProjectsController } from './projects.controller';
import { WorkItemsController } from './work-items.controller';
import { ProjectMembersController } from './project-members.controller';
import { ProjectPropertiesController } from './project-properties.controller';
import { ProjectsService } from './projects.service';
import { WorkItemsService } from './work-items.service';
import { ScheduleService } from './schedule.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectPropertiesService } from './project-properties.service';
import { SpacesModule } from '../spaces/spaces.module';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SpacesModule, UsersModule, PermissionsModule],
  controllers: [
    SpaceProjectsController,
    ProjectsController,
    WorkItemsController,
    ProjectMembersController,
    ProjectPropertiesController,
  ],
  providers: [
    ProjectsService,
    WorkItemsService,
    ScheduleService,
    ProjectMembersService,
    ProjectPropertiesService,
  ],
  exports: [ProjectsService, ScheduleService],
})
export class ProjectsModule {}
