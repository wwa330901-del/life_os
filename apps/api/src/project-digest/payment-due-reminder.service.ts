import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiTodayRange } from '../common/taipei-date';
import { ProjectRole, SpaceType } from '../../generated/prisma/client.js';

/** 付款排程自動化（2026-09，顧問文件財務系統子項）——每天早上 9am
 * Asia/Taipei 掃描 dueDate 落在「今天或已過期」且還沒標記 paidDate 的請
 * 款單分期，LINE 通知該專案 PM。跟 DailyReportReminderService 一樣一人
 * 身兼多個專案 PM 時只收到一則整合訊息。dueDate 是選填欄位，沒設定的期
 * 別完全不受這支影響（沿用既有分期照舊）。 */
@Injectable()
export class PaymentDueReminderService {
  private readonly logger = new Logger(PaymentDueReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Taipei' })
  async remindDuePayments() {
    const today = taipeiTodayRange().end;
    const periods = await this.prisma.paymentRequestPeriod.findMany({
      where: {
        paidDate: null,
        dueDate: { not: null, lte: today },
        costControlRow: { project: { space: { type: SpaceType.COMPANY } } },
      },
      include: {
        costControlRow: {
          include: {
            project: {
              include: { members: { where: { role: ProjectRole.PM } } },
            },
          },
        },
      },
    });

    const dueByUser = new Map<string, string[]>();
    for (const period of periods) {
      const project = period.costControlRow.project;
      for (const pm of project.members) {
        const labels = dueByUser.get(pm.userId) ?? [];
        labels.push(`「${project.name}」${period.periodLabel}`);
        dueByUser.set(pm.userId, labels);
      }
    }

    for (const [userId, labels] of dueByUser) {
      const message =
        labels.length === 1
          ? `💰 付款排程提醒\n${labels[0]} 已到期或逾期，請盡快處理付款。`
          : `💰 付款排程提醒\n以下請款單已到期或逾期，請盡快處理付款：\n${labels.map((l) => `・${l}`).join('\n')}`;
      try {
        await this.lineNotifier.notifyByUser(userId, message);
      } catch (error) {
        this.logger.error(`付款排程通知失敗（userId=${userId}）`, error);
      }
    }
  }
}
