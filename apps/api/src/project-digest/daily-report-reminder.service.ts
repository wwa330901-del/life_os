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

    /** 一人身兼多個專案 PM 時，今晚只收到一則整合訊息，不是每個專案各發一
     * 則——先依 userId 分組收集專案名稱，迴圈跑完全部專案後才逐人發送。 */
    const missingByUser = new Map<string, string[]>();
    for (const project of projects) {
      if (!isWorkingDay(today, project)) continue;
      if (project.dailyReports.length > 0) continue;

      for (const pm of project.members) {
        const names = missingByUser.get(pm.userId) ?? [];
        names.push(project.name);
        missingByUser.set(pm.userId, names);
      }
    }

    for (const [userId, projectNames] of missingByUser) {
      const message =
        projectNames.length === 1
          ? `📋 日報催辦提醒\n「${projectNames[0]}」今天還沒有人填寫工程日報表。`
          : `📋 日報催辦提醒\n今天還沒有人填寫工程日報表的專案：\n${projectNames.map((name) => `・「${name}」`).join('\n')}`;

      try {
        await this.lineNotifier.notifyByUser(userId, message);
      } catch (error) {
        this.logger.error(`日報催辦通知失敗（userId=${userId}）`, error);
      }
    }
  }
}
