import { Module } from '@nestjs/common';
import { HomeModule } from '../home/home.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { ProjectDigestService } from './project-digest.service';
import { TodoDigestService } from './todo-digest.service';
import { DailyReportReminderService } from './daily-report-reminder.service';
import { WeeklyReportReminderService } from './weekly-report-reminder.service';
import { PaymentDueReminderService } from './payment-due-reminder.service';

@Module({
  imports: [HomeModule, LineNotifierModule],
  providers: [
    ProjectDigestService,
    TodoDigestService,
    DailyReportReminderService,
    WeeklyReportReminderService,
    PaymentDueReminderService,
  ],
})
export class ProjectDigestModule {}
