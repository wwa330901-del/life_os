import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiTodayRange } from '../common/taipei-date';
import { ProjectRole, SpaceType } from '../../generated/prisma/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function mondayOfTaipeiWeek(taipeiDateMidnightUtc: Date): Date {
  const isoWeekday = taipeiDateMidnightUtc.getUTCDay() || 7;
  return new Date(taipeiDateMidnightUtc.getTime() - (isoWeekday - 1) * DAY_MS);
}

/** 每週五傍晚，提醒每個公司空間專案的 PM 本週工程週報還沒交——同
 * DailyReportReminderService 的「沒東西可報就沉默」慣例，已經交過的專
 * 案不會收到訊息。週報不像日報要跳過公休日，一律每週五檢查一次。 */
@Injectable()
export class WeeklyReportReminderService {
  private readonly logger = new Logger(WeeklyReportReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron('0 18 * * 5', { timeZone: 'Asia/Taipei' })
  async remindMissingReports() {
    const weekStartDate = mondayOfTaipeiWeek(taipeiTodayRange().start);
    const projects = await this.prisma.project.findMany({
      where: { space: { type: SpaceType.COMPANY } },
      include: {
        members: { where: { role: ProjectRole.PM } },
        weeklyReports: { where: { weekStartDate } },
      },
    });

    for (const project of projects) {
      if (project.weeklyReports.length > 0) continue;

      for (const pm of project.members) {
        try {
          await this.lineNotifier.notifyByUser(
            pm.userId,
            `📋 週報催辦提醒\n「${project.name}」本週還沒有人填寫工程週報表。`,
          );
        } catch (error) {
          this.logger.error(
            `週報催辦通知失敗（projectId=${project.id}, userId=${pm.userId}）`,
            error,
          );
        }
      }
    }
  }
}
