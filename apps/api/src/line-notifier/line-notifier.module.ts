import { Module } from '@nestjs/common';
import { LineNotifierService } from './line-notifier.service';
import { LineMessageLogService } from './line-message-log.service';

@Module({
  providers: [LineNotifierService, LineMessageLogService],
  exports: [LineNotifierService, LineMessageLogService],
})
export class LineNotifierModule {}
