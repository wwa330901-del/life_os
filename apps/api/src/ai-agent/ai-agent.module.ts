import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { StocksModule } from '../stocks/stocks.module';
import { CalendarModule } from '../calendar/calendar.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { UsersModule } from '../users/users.module';
import { TodosModule } from '../todos/todos.module';
import { LifeGoalsModule } from '../life-goals/life-goals.module';
import { TripsModule } from '../trips/trips.module';
import { LifeReviewModule } from '../life-review/life-review.module';
import { JournalModule } from '../journal/journal.module';
import { FinanceReportModule } from '../finance/finance-report.module';
import { DivinationModule } from '../divination/divination.module';
import { MemoryModule } from '../memory/memory.module';
import { AiAgentService } from './ai-agent.service';
import { RecordToolsService } from './record-tools.service';
import { AiAssistantController } from './ai-assistant.controller';

/** 萬用 AI — one brain shared by LINE (LineModule imports this) and the
 * App's AI 問答 (`POST /ai-assistant/ask`, same route/shape as before so
 * installed Apps keep working without an update). */
@Module({
  imports: [
    FinanceModule,
    StocksModule,
    CalendarModule,
    KnowledgeModule,
    AiAssistantModule,
    UsersModule,
    TodosModule,
    LifeGoalsModule,
    LifeReviewModule,
    JournalModule,
    FinanceReportModule,
    DivinationModule,
    MemoryModule,
    TripsModule,
  ],
  controllers: [AiAssistantController],
  providers: [AiAgentService, RecordToolsService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
