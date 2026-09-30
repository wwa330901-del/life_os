import { Module } from '@nestjs/common';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { JournalAiService } from './journal-ai.service';
import { JournalReminderService } from './journal-reminder.service';

@Module({
  imports: [LineNotifierModule],
  controllers: [JournalController],
  providers: [JournalService, JournalAiService, JournalReminderService],
  // 萬用 AI（記日記/查日記）與週/月回顧（寫了幾天、平均心情）會用到。
  exports: [JournalService, JournalAiService],
})
export class JournalModule {}
