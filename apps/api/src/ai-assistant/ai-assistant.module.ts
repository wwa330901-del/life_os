import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CalendarModule } from '../calendar/calendar.module';
import { TodosModule } from '../todos/todos.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { UsersModule } from '../users/users.module';
import { AiQueryToolsService } from './ai-query-tools.service';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';

@Module({
  imports: [FinanceModule, CalendarModule, TodosModule, KnowledgeModule, UsersModule],
  controllers: [AiAssistantController],
  providers: [AiQueryToolsService, AiAssistantService],
  // AiQueryToolsService's read-only tools are also composed into the LINE 萬用 AI.
  exports: [AiAssistantService, AiQueryToolsService],
})
export class AiAssistantModule {}
