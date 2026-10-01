import { Module } from '@nestjs/common';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { MemoryAiService } from './memory-ai.service';
import { ImportantDateReminderService } from './important-date-reminder.service';

@Module({
  imports: [LineNotifierModule],
  controllers: [MemoryController],
  providers: [MemoryService, MemoryAiService, ImportantDateReminderService],
  // 萬用 AI（記住/重要日子工具、系統提示背景）。
  exports: [MemoryService, MemoryAiService],
})
export class MemoryModule {}
