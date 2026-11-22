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
import { LineWebhookController } from './line-webhook.controller';
import { LineLinkController } from './line-link.controller';
import { LineSettingsController } from './line-settings.controller';
import { LineService } from './line.service';
import { LineReplyService } from './line-reply.service';
import { LineLinkingService } from './line-linking.service';
import { LineTodoCommandsService } from './line-todo-commands.service';
import { LineCalendarCommandsService } from './line-calendar-commands.service';
import { LineFinanceCommandsService } from './line-finance-commands.service';
import { LineLoanCommandsService } from './line-loan-commands.service';
import { LineStockCommandsService } from './line-stock-commands.service';
import { LineKnowledgeService } from './line-knowledge.service';
import { LineAiService } from './line-ai.service';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { VoiceTranscriberService } from './voice-transcriber.service';
import { ReceiptReaderService } from './receipt-reader.service';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { LifeReviewModule } from '../life-review/life-review.module';
import { FinanceReportModule } from '../finance/finance-report.module';
import { DailyBriefModule } from '../daily-brief/daily-brief.module';
import { AdminModule } from '../admin/admin.module';

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
    AiAgentModule,
    LifeReviewModule,
    FinanceReportModule,
    DailyBriefModule,
    AdminModule,
    TripsModule,
    LineNotifierModule,
  ],
  controllers: [LineWebhookController, LineLinkController, LineSettingsController],
  providers: [
    LineService,
    LineReplyService,
    LineLinkingService,
    LineTodoCommandsService,
    LineCalendarCommandsService,
    LineFinanceCommandsService,
    LineLoanCommandsService,
    LineStockCommandsService,
    LineKnowledgeService,
    LineAiService,
    VoiceTranscriberService, ReceiptReaderService,
  ],
})
export class LineModule {}
