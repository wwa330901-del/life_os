import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { LineWebhookController } from './line-webhook.controller';
import { LineLinkController } from './line-link.controller';
import { LineService } from './line.service';

@Module({
  imports: [FinanceModule],
  controllers: [LineWebhookController, LineLinkController],
  providers: [LineService],
})
export class LineModule {}
