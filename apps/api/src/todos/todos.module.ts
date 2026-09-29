import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { TodosService } from './todos.service';
import { TodosController } from './todos.controller';

@Module({
  imports: [CalendarModule],
  controllers: [TodosController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}
