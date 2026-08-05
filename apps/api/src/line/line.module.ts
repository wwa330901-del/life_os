import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { StocksModule } from '../stocks/stocks.module';
import { CalendarModule } from '../calendar/calendar.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { UsersModule } from '../users/users.module';
import { TodosModule } from '../todos/todos.module';
import { LineWebhookController } from './line-webhook.controller';
import { LineLinkController } from './line-link.controller';
import { LineService } from './line.service';

@Module({
  imports: [
    FinanceModule,
    StocksModule,
    CalendarModule,
    KnowledgeModule,
    AiAssistantModule,
    UsersModule,
    TodosModule,
  ],
  controllers: [LineWebhookController, LineLinkController],
  providers: [LineService],
})
export class LineModule {}
