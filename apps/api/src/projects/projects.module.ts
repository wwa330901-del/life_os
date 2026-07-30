import { Module } from '@nestjs/common';
import { SpaceProjectsController } from './space-projects.controller';
import { ProjectsController } from './projects.controller';
import { WorkItemsController } from './work-items.controller';
import { ProjectMembersController } from './project-members.controller';
import { ProjectOptionsController } from './project-options.controller';
import { ProjectPropertiesController } from './project-properties.controller';
import { ProjectTodosController } from './project-todos.controller';
import { ProjectsService } from './projects.service';
import { WorkItemsService } from './work-items.service';
import { ScheduleService } from './schedule.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectOptionsService } from './project-options.service';
import { ProjectPropertiesService } from './project-properties.service';
import { ProjectTodosService } from './project-todos.service';
import { SpacesModule } from '../spaces/spaces.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [SpacesModule, UsersModule],
  controllers: [
    SpaceProjectsController,
    ProjectsController,
    WorkItemsController,
    ProjectMembersController,
    ProjectOptionsController,
    ProjectPropertiesController,
    ProjectTodosController,
  ],
  providers: [
    ProjectsService,
    WorkItemsService,
    ScheduleService,
    ProjectMembersService,
    ProjectOptionsService,
    ProjectPropertiesService,
    ProjectTodosService,
  ],
  exports: [ProjectsService, ProjectTodosService],
})
export class ProjectsModule {}
