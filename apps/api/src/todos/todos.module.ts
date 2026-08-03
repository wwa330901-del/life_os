import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TodosService } from './todos.service';
import { TodosController } from './todos.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [TodosController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}
