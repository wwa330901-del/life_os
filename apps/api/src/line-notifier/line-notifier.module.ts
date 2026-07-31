import { Module } from '@nestjs/common';
import { LineNotifierService } from './line-notifier.service';

@Module({
  providers: [LineNotifierService],
  exports: [LineNotifierService],
})
export class LineNotifierModule {}
