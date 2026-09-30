import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CalendarModule } from '../calendar/calendar.module';
import { TodosModule } from '../todos/todos.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { UsersModule } from '../users/users.module';
import { StocksModule } from '../stocks/stocks.module';
import { LifeGoalsModule } from '../life-goals/life-goals.module';
import { AiQueryToolsService } from './ai-query-tools.service';
import { AiAssistantService } from './ai-assistant.service';

@Module({
  imports: [FinanceModule, CalendarModule, TodosModule, KnowledgeModule, UsersModule, StocksModule, LifeGoalsModule],
  providers: [AiQueryToolsService, AiAssistantService],
  // AiQueryToolsService's read-only tools are also composed into the 萬用 AI (ai-agent);
  // AiAssistantService is still used by LINE's「查詢」command.
  exports: [AiAssistantService, AiQueryToolsService],
})
export class AiAssistantModule {}
