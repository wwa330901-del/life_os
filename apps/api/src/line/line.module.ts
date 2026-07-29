import { Module } from '@nestjs/common';
import { LineWebhookController } from './line-webhook.controller';
import { LineLinkController } from './line-link.controller';
import { LineService } from './line.service';

@Module({
  controllers: [LineWebhookController, LineLinkController],
  providers: [LineService],
})
export class LineModule {}
