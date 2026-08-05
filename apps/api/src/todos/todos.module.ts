import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { CalendarModule } from '../calendar/calendar.module';
import { TodosService } from './todos.service';
import { TodosController } from './todos.controller';

@Module({
  imports: [ProjectsModule, CalendarModule],
  controllers: [TodosController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}
