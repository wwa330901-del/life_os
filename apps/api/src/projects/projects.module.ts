import { Module } from '@nestjs/common';
import { SpaceProjectsController } from './space-projects.controller';
import { ProjectsController } from './projects.controller';
import { WorkItemsController } from './work-items.controller';
import { ProjectsService } from './projects.service';
import { WorkItemsService } from './work-items.service';
import { ScheduleService } from './schedule.service';
import { SpacesModule } from '../spaces/spaces.module';

@Module({
  imports: [SpacesModule],
  controllers: [SpaceProjectsController, ProjectsController, WorkItemsController],
  providers: [ProjectsService, WorkItemsService, ScheduleService],
})
export class ProjectsModule {}
