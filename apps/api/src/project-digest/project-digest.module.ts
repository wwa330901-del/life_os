import { Module } from '@nestjs/common';
import { HomeModule } from '../home/home.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { ProjectDigestService } from './project-digest.service';
import { TodoDigestService } from './todo-digest.service';
import { DailyReportReminderService } from './daily-report-reminder.service';

@Module({
  imports: [HomeModule, LineNotifierModule],
  providers: [
    ProjectDigestService,
    TodoDigestService,
    DailyReportReminderService,
  ],
})
export class ProjectDigestModule {}
