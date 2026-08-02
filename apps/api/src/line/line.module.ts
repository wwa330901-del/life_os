import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { StocksModule } from '../stocks/stocks.module';
import { CalendarModule } from '../calendar/calendar.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LineWebhookController } from './line-webhook.controller';
import { LineLinkController } from './line-link.controller';
import { LineService } from './line.service';

@Module({
  imports: [FinanceModule, StocksModule, CalendarModule, KnowledgeModule],
  controllers: [LineWebhookController, LineLinkController],
  providers: [LineService],
})
export class LineModule {}
