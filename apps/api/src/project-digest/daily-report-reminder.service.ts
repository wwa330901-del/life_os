import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { isWorkingDay } from '../projects/scheduling/holiday-calendar';
import { taipeiTodayRange } from '../common/taipei-date';
import { ProjectRole, SpaceType } from '../../generated/prisma/client.js';

/** Every evening, tells each company-space project's PM(s) if today's
 * 工程日報表 is still missing — 顧問文件「工程日報表：...自動彙出「今日
 * 未交日報」清單並發送催辦通知」. Skips a project entirely on its own
 * 公休日（見 isWorkingDay）— 週末/國定假日不要求交報，不誤發催辦。 Same
 * "silence if nothing to report" bias as ProjectDigestService — a project
 * that already has today's report gets no message. */
@Injectable()
export class DailyReportReminderService {
  private readonly logger = new Logger(DailyReportReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8PM, { timeZone: 'Asia/Taipei' })
  async remindMissingReports() {
    const today = taipeiTodayRange().start;
    const projects = await this.prisma.project.findMany({
      where: { space: { type: SpaceType.COMPANY } },
      include: {
        members: { where: { role: ProjectRole.PM } },
        dailyReports: { where: { reportDate: today } },
      },
    });

    for (const project of projects) {
      if (!isWorkingDay(today, project)) continue;
      if (project.dailyReports.length > 0) continue;

      for (const pm of project.members) {
        try {
          await this.lineNotifier.notifyByUser(
            pm.userId,
            `📋 日報催辦提醒\n「${project.name}」今天還沒有人填寫工程日報表。`,
          );
        } catch (error) {
          this.logger.error(
            `日報催辦通知失敗（projectId=${project.id}, userId=${pm.userId}）`,
            error,
          );
        }
      }
    }
  }
}
